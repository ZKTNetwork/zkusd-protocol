// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/IDefaultPool.sol";

/*
 * The Default Pool holds the NEON and ZKUSD debt (but not ZKUSD tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending NEON and ZKUSD debt, its pending NEON and ZKUSD debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, IDefaultPool {
    using SafeMath for uint256;

    string public constant NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    uint256 internal NEON; // deposited NEON tracker
    uint256 internal ZKUSDDebt; // debt

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        //renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the NEON state variable.
     *
     * Not necessarily equal to the the contract's raw NEON balance - NEON can be forcibly sent to contracts.
     */
    function getNEON() external view override returns (uint256) {
        return NEON;
    }

    function getZKUSDDebt() external view override returns (uint256) {
        return ZKUSDDebt;
    }

    // --- Pool functionality ---

    function sendNEONToActivePool(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        NEON = NEON.sub(_amount);
        emit DefaultPoolNEONBalanceUpdated(NEON);
        emit ConfluxSent(activePool, _amount);

        (bool success, ) = activePool.call{value: _amount}("");
        require(success, "DefaultPool: sending NEON failed");
    }

    function increaseZKUSDDebt(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        ZKUSDDebt = ZKUSDDebt.add(_amount);
        emit DefaultPoolZKUSDDebtUpdated(ZKUSDDebt);
    }

    function decreaseZKUSDDebt(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        ZKUSDDebt = ZKUSDDebt.sub(_amount);
        emit DefaultPoolZKUSDDebtUpdated(ZKUSDDebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "DefaultPool: Caller is not the ActivePool"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "DefaultPool: Caller is not the TroveManager"
        );
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        NEON = NEON.add(msg.value);
        emit DefaultPoolNEONBalanceUpdated(NEON);
    }
}
