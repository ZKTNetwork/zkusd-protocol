// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/IActivePool.sol";

/*
 * The Active Pool holds the NEON collateral and ZKUSD debt (but not ZKUSD tokens) for all active troves.
 *
 * When a trove is liquidated, it's NEON and ZKUSD debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, IActivePool {
    using SafeMath for uint256;

    string public constant NAME = "ActivePool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public stabilityPoolAddress;
    address public defaultPoolAddress;
    uint256 internal NEON; // deposited ether tracker
    uint256 internal ZKUSDDebt;

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _defaultPoolAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_defaultPoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the NEON state variable.
     *
     *Not necessarily equal to the the contract's raw NEON balance - ether can be forcibly sent to contracts.
     */
    function getNEON() external view override returns (uint256) {
        return NEON;
    }

    function getZKUSDDebt() external view override returns (uint256) {
        return ZKUSDDebt;
    }

    // --- Pool functionality ---

    function sendNEON(address _account, uint256 _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        NEON = NEON.sub(_amount);
        emit ActivePoolNEONBalanceUpdated(NEON);
        emit EtherSent(_account, _amount);

        (bool success, ) = _account.call{value: _amount}("");
        require(success, "ActivePool: sending NEON failed");
    }

    function increaseZKUSDDebt(uint256 _amount) external override {
        _requireCallerIsBOorTroveM();
        ZKUSDDebt = ZKUSDDebt.add(_amount);
        emit ActivePoolZKUSDDebtUpdated(ZKUSDDebt);
    }

    function decreaseZKUSDDebt(uint256 _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        ZKUSDDebt = ZKUSDDebt.sub(_amount);
        emit ActivePoolZKUSDDebtUpdated(ZKUSDDebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BO nor Default Pool"
        );
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        );
    }

    function _requireCallerIsBOorTroveM() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager"
        );
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        NEON = NEON.add(msg.value);
        emit ActivePoolNEONBalanceUpdated(NEON);
    }
}
