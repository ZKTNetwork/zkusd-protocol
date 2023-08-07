// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/ICommunityIssuance.sol";
import "../interfaces/IZKTStaking.sol";
import "../interfaces/IZKToken.sol";
import "../interfaces/IZKUSDToken.sol";
import "../dependencies/CheckContract.sol";
import "../dependencies/FullMath.sol";

contract ZKTStaking is IZKTStaking, Ownable, CheckContract {
    using SafeMath for uint256;

    // --- Data ---
    string public constant NAME = "ZKTStaking";
    uint256 public constant DECIMAL_PRECISION = 1e18;

    mapping(address => uint256) public stakes;
    uint256 public totalZKTStaked;

    uint256 public F_NEON; // Running sum of NEON fees per-ZKT-staked
    uint256 public F_ZKUSD; // Running sum of ZKT fees per-ZKT-staked

    // User snapshots of F_NEON and F_ZKUSD, taken at the point at which their latest deposit was made
    mapping(address => Snapshot) public snapshots;

    struct Snapshot {
        uint256 F_NEON_Snapshot;
        uint256 F_ZKUSD_Snapshot;
    }

    IZKToken public zkToken;
    IZKUSDToken public zkusdToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    constructor(address _ownership) {
        _transferOwnership(_ownership);
    }

    function setAddresses(
        address _zkTokenAddress,
        address _zkusdTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external override onlyOwner {
        checkContract(_zkTokenAddress);
        checkContract(_zkusdTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        zkToken = IZKToken(_zkTokenAddress);
        zkusdToken = IZKUSDToken(_zkusdTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        emit ZKTTokenAddressSet(_zkTokenAddress);
        emit ZKTTokenAddressSet(_zkusdTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        //renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated NEON and ZKUSD gains to them.
    function stake(uint256 _ZKTamount) external override {
        _requireNonZeroAmount(_ZKTamount);

        uint256 currentStake = stakes[msg.sender];

        uint256 NEONGain;
        uint256 ZKUSDGain;
        // Grab any accumulated NEON and ZKUSD gains from the current stake
        if (currentStake != 0) {
            NEONGain = _getPendingNEONGain(msg.sender);
            ZKUSDGain = _getPendingZKUSDGain(msg.sender);
        }

        _updateUserSnapshots(msg.sender);

        uint256 newStake = currentStake.add(_ZKTamount);

        // Increase user’s stake and total ZKT staked
        stakes[msg.sender] = newStake;
        totalZKTStaked = totalZKTStaked.add(_ZKTamount);
        emit TotalZKTStakedUpdated(totalZKTStaked);

        // Transfer ZKT from caller to this contract
        zkToken.sendToZKTStaking(msg.sender, _ZKTamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, ZKUSDGain, NEONGain);

        // Send accumulated ZKUSD and NEON gains to the caller
        if (currentStake != 0) {
            zkusdToken.transfer(msg.sender, ZKUSDGain);
            _sendNEONGainToUser(NEONGain);
        }
    }

    // Unstake the ZKT and send the it back to the caller, along with their accumulated ZKUSD & NEON gains.
    // If requested amount > stake, send their entire stake.
    function unstake(uint256 _ZKTamount) external override {
        uint256 currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated NEON and ZKUSD gains from the current stake
        uint256 NEONGain = _getPendingNEONGain(msg.sender);
        uint256 ZKUSDGain = _getPendingZKUSDGain(msg.sender);

        _updateUserSnapshots(msg.sender);

        if (_ZKTamount > 0) {
            uint256 ZKTToWithdraw = Math.min(_ZKTamount, currentStake);

            uint256 newStake = currentStake.sub(ZKTToWithdraw);

            // Decrease user's stake and total ZKT staked
            stakes[msg.sender] = newStake;
            totalZKTStaked = totalZKTStaked.sub(ZKTToWithdraw);
            emit TotalZKTStakedUpdated(totalZKTStaked);

            // Transfer unstaked ZKT to user
            zkToken.transfer(msg.sender, ZKTToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, ZKUSDGain, NEONGain);

        // Send accumulated ZKUSD and NEON gains to the caller
        zkusdToken.transfer(msg.sender, ZKUSDGain);
        _sendNEONGainToUser(NEONGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Liquity core contracts ---

    function increaseF_NEON(uint256 _NEONFee) external override {
        _requireCallerIsTroveManager();
        uint256 NEONFeePerZKTStaked;

        if (totalZKTStaked > 0) {
            NEONFeePerZKTStaked = _NEONFee.mul(DECIMAL_PRECISION).div(
                totalZKTStaked
            );
        }

        F_NEON = F_NEON.add(NEONFeePerZKTStaked);
        emit F_NEONUpdated(F_NEON);
    }

    function increaseF_ZKUSD(uint256 _ZKUSDFee) external override {
        _requireCallerIsBorrowerOperations();
        uint256 ZKUSDFeePerZKTStaked;

        if (totalZKTStaked > 0) {
            ZKUSDFeePerZKTStaked = _ZKUSDFee.mul(DECIMAL_PRECISION).div(
                totalZKTStaked
            );
        }

        F_ZKUSD = F_ZKUSD.add(ZKUSDFeePerZKTStaked);
        emit F_ZKUSDUpdated(F_ZKUSD);
    }

    // --- Pending reward functions ---

    function getPendingNEONGain(
        address _user
    ) external view override returns (uint256) {
        return _getPendingNEONGain(_user);
    }

    function _getPendingNEONGain(address _user) internal view returns (uint256) {
        uint256 F_NEON_Snapshot = snapshots[_user].F_NEON_Snapshot;
        uint256 NEONGain = stakes[_user].mul(F_NEON.sub(F_NEON_Snapshot)).div(
            DECIMAL_PRECISION
        );
        return NEONGain;
    }

    function getPendingZKUSDGain(
        address _user
    ) external view override returns (uint256) {
        return _getPendingZKUSDGain(_user);
    }

    function _getPendingZKUSDGain(
        address _user
    ) internal view returns (uint256) {
        uint256 F_ZKUSD_Snapshot = snapshots[_user].F_ZKUSD_Snapshot;
        uint256 ZKUSDGain = stakes[_user]
            .mul(F_ZKUSD.sub(F_ZKUSD_Snapshot))
            .div(DECIMAL_PRECISION);
        return ZKUSDGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_NEON_Snapshot = F_NEON;
        snapshots[_user].F_ZKUSD_Snapshot = F_ZKUSD;
        emit StakerSnapshotsUpdated(_user, F_NEON, F_ZKUSD);
    }

    function _sendNEONGainToUser(uint256 NEONGain) internal {
        emit NeonSent(msg.sender, NEONGain);
        (bool success, ) = msg.sender.call{value: NEONGain}("");
        require(success, "ZKTStaking: Failed to send accumulated NEONGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "ZKTStaking: caller is not TroveM"
        );
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "ZKTStaking: caller is not BorrowerOps"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "ZKTStaking: caller is not ActivePool"
        );
    }

    function _requireUserHasStake(uint256 currentStake) internal pure {
        require(
            currentStake > 0,
            "ZKTStaking: User must have a non-zero stake"
        );
    }

    function _requireNonZeroAmount(uint256 _amount) internal pure {
        require(_amount > 0, "ZKTStaking: Amount must be non-zero");
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
