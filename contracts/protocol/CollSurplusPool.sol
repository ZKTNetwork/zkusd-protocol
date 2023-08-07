// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/ICollSurplusPool.sol";

contract CollSurplusPool is Ownable, CheckContract, ICollSurplusPool {
    using SafeMath for uint256;

    string public constant NAME = "CollSurplusPool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public activePoolAddress;

    // Deposited NEON tracker
    uint256 internal NEON;
    // Collateral surplus claimable by trove owners
    mapping(address => uint256) internal balances;

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress
    ) external override onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        //renounceOwnership();
    }

    /* Returns the NEON state variable at ActivePool address.
    Not necessarily equal to the raw NEON balance - NEON can be forcibly sent to contracts. */
    function getNEON() external view override returns (uint256) {
        return NEON;
    }

    function getCollateral(
        address _account
    ) external view override returns (uint256) {
        return balances[_account];
    }

    // --- Pool functionality ---

    function accountSurplus(
        address _account,
        uint256 _amount
    ) external override {
        _requireCallerIsTroveManager();

        uint256 newAmount = balances[_account].add(_amount);
        balances[_account] = newAmount;

        emit CollBalanceUpdated(_account, newAmount);
    }

    function claimColl(address _account) external override {
        _requireCallerIsBorrowerOperations();
        uint256 claimableColl = balances[_account];
        require(
            claimableColl > 0,
            "CollSurplusPool: No collateral available to claim"
        );

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        NEON = NEON.sub(claimableColl);
        emit NeonSent(_account, claimableColl);

        (bool success, ) = _account.call{value: claimableColl}("");
        require(success, "CollSurplusPool: sending NEON failed");
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "CollSurplusPool: Caller is not Borrower Operations"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "CollSurplusPool: Caller is not TroveManager"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "CollSurplusPool: Caller is not Active Pool"
        );
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        NEON = NEON.add(msg.value);
    }
}
