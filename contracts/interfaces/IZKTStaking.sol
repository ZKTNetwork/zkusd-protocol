// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IZKTStaking {
    // --- Events --

    event ZKTTokenAddressSet(address _zkTokenAddress);
    event ZKUSDTokenAddressSet(address _zkusdTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint256 newStake);
    event StakingGainsWithdrawn(
        address indexed staker,
        uint256 ZKUSDGain,
        uint256 ETHGain
    );
    event F_ETHUpdated(uint256 _F_ETH);
    event F_ZKUSDUpdated(uint256 _F_ZKUSD);
    event TotalZKTStakedUpdated(uint256 _totalZKTStaked);
    event EtherSent(address _account, uint256 _amount);
    event StakerSnapshotsUpdated(
        address _staker,
        uint256 _F_ETH,
        uint256 _F_ZKUSD
    );

    // --- Functions ---

    function setAddresses(
        address _zkTokenAddress,
        address _zkusdTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external;

    function stake(uint256 _ZKTamount) external;

    function unstake(uint256 _ZKTamount) external;

    function increaseF_ETH(uint256 _ETHFee) external;

    function increaseF_ZKUSD(uint256 _ZKTFee) external;

    function getPendingETHGain(address _user) external view returns (uint256);

    function getPendingZKUSDGain(address _user) external view returns (uint256);
}
