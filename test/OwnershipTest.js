const deploymentHelper = require("../utils/deploymentHelpers.js");
const { TestHelper: th, MoneyValues: mv } = require("../utils/testHelpers.js");

const GasPool = artifacts.require("./GasPool.sol");
const BorrowerOperationsTester = artifacts.require(
  "./BorrowerOperationsTester.sol"
);

contract("All Liquity functions with onlyOwner modifier", async (accounts) => {
  const [owner, alice, bob] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  let contracts;
  let zkusdToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;

  let zktStaking;
  let communityIssuance;
  let zkToken;
  let lockupContractFactory;

  before(async () => {
    contracts = await deploymentHelper.deployLiquityCore();
    contracts.borrowerOperations = await BorrowerOperationsTester.new();
    contracts = await deploymentHelper.deployZKUSDToken(contracts);
    const ZKTContracts = await deploymentHelper.deployZKTContracts(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );

    zkusdToken = contracts.zkusdToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    activePool = contracts.activePool;
    stabilityPool = contracts.stabilityPool;
    defaultPool = contracts.defaultPool;
    borrowerOperations = contracts.borrowerOperations;

    zktStaking = ZKTContracts.zktStaking;
    communityIssuance = ZKTContracts.communityIssuance;
    zkToken = ZKTContracts.zkToken;
    lockupContractFactory = ZKTContracts.lockupContractFactory;
  });

  const testZeroAddress = async (
    contract,
    params,
    method = "setAddresses",
    skip = 0
  ) => {
    await testWrongAddress(
      contract,
      params,
      th.ZERO_ADDRESS,
      method,
      skip,
      "Account cannot be zero address"
    );
  };
  const testNonContractAddress = async (
    contract,
    params,
    method = "setAddresses",
    skip = 0
  ) => {
    await testWrongAddress(
      contract,
      params,
      bob,
      method,
      skip,
      "Account code size cannot be zero"
    );
  };
  const testWrongAddress = async (
    contract,
    params,
    address,
    method,
    skip,
    message
  ) => {
    for (let i = skip; i < params.length; i++) {
      const newParams = [...params];
      newParams[i] = address;
      await th.assertRevert(
        contract[method](...newParams, { from: owner }),
        message
      );
    }
  };

  const testSetAddresses = async (contract, numberOfAddresses) => {
    const dumbContract = await GasPool.new();
    const params = Array(numberOfAddresses).fill(dumbContract.address);

    // Attempt call from alice
    await th.assertRevert(contract.setAddresses(...params, { from: alice }));

    // Attempt to use zero address
    await testZeroAddress(contract, params);
    // Attempt to use non contract
    await testNonContractAddress(contract, params);

    // Owner can successfully set any address
    const txOwner = await contract.setAddresses(...params, { from: owner });
    assert.isTrue(txOwner.receipt.status);
    // fails if called twice
    await th.assertRevert(contract.setAddresses(...params, { from: owner }));
  };

  describe("TroveManager", async (accounts) => {
    it("setAddresses(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      await testSetAddresses(troveManager, 11);
    });
  });

  describe("BorrowerOperations", async (accounts) => {
    it("setAddresses(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      await testSetAddresses(borrowerOperations, 10);
    });
  });

  describe("DefaultPool", async (accounts) => {
    it("setAddresses(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      await testSetAddresses(defaultPool, 2);
    });
  });

  describe("StabilityPool", async (accounts) => {
    it("setAddresses(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      await testSetAddresses(stabilityPool, 7);
    });
  });

  describe("ActivePool", async (accounts) => {
    it("setAddresses(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      await testSetAddresses(activePool, 4);
    });
  });

  describe("SortedTroves", async (accounts) => {
    it("setParams(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      const dumbContract = await GasPool.new();
      const params = [10000001, dumbContract.address, dumbContract.address];

      // Attempt call from alice
      await th.assertRevert(sortedTroves.setParams(...params, { from: alice }));

      // Attempt to use zero address
      await testZeroAddress(sortedTroves, params, "setParams", 1);
      // Attempt to use non contract
      await testNonContractAddress(sortedTroves, params, "setParams", 1);

      // Owner can successfully set params
      const txOwner = await sortedTroves.setParams(...params, { from: owner });
      assert.isTrue(txOwner.receipt.status);

      // fails if called twice
      await th.assertRevert(sortedTroves.setParams(...params, { from: owner }));
    });
  });

  describe("CommunityIssuance", async (accounts) => {
    it("setAddresses(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      const params = [zkToken.address, stabilityPool.address];
      await th.assertRevert(
        communityIssuance.setAddresses(...params, { from: alice })
      );

      // Attempt to use zero address
      await testZeroAddress(communityIssuance, params);
      // Attempt to use non contract
      await testNonContractAddress(communityIssuance, params);

      // Owner can successfully set any address
      const txOwner = await communityIssuance.setAddresses(...params, {
        from: owner,
      });

      assert.isTrue(txOwner.receipt.status);
      // fails if called twice
      await th.assertRevert(
        communityIssuance.setAddresses(...params, { from: owner })
      );
    });
  });

  describe("ZKTStaking", async (accounts) => {
    it("setAddresses(): reverts when called by non-owner, with wrong addresses, or twice", async () => {
      await testSetAddresses(zktStaking, 5);
    });
  });

  describe("LockupContractFactory", async (accounts) => {
    it("setZKTAddress(): reverts when called by non-owner, with wrong address, or twice", async () => {
      await th.assertRevert(
        lockupContractFactory.setZKTokenAddress(zkToken.address, {
          from: alice,
        })
      );

      const params = [zkToken.address];

      // Attempt to use zero address
      await testZeroAddress(lockupContractFactory, params, "setZKTokenAddress");
      // Attempt to use non contract
      await testNonContractAddress(
        lockupContractFactory,
        params,
        "setZKTokenAddress"
      );

      // Owner can successfully set any address
      const txOwner = await lockupContractFactory.setZKTokenAddress(
        zkToken.address,
        { from: owner }
      );

      assert.isTrue(txOwner.receipt.status);
      // fails if called twice
      await th.assertRevert(
        lockupContractFactory.setZKTokenAddress(zkToken.address, {
          from: owner,
        })
      );
    });
  });
});
