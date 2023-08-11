const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const assertRevert = th.assertRevert;
const toBN = th.toBN;
const dec = th.dec;

contract(
  "Deploying the ZKT contracts: LCF, CI, ZKTStaking, and ZKToken ",
  async (accounts) => {
    const [liquityAG, A, B] = accounts;
    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(
      997,
      1000
    );

    let ZKTContracts;

    const oneMillion = toBN(1000000);
    const digits = toBN(1e18);
    const thirtyTwo = toBN(32);
    const expectedCISupplyCap = thirtyTwo.mul(oneMillion).mul(digits);

    beforeEach(async () => {
      // Deploy all contracts from the first account
      ZKTContracts = await deploymentHelper.deployZKTContracts(
        bountyAddress,
        lpRewardsAddress,
        multisig
      );
      await deploymentHelper.connectZKTContracts(ZKTContracts);

      zktStaking = ZKTContracts.zktStaking;
      zkToken = ZKTContracts.zkToken;
      communityIssuance = ZKTContracts.communityIssuance;
      lockupContractFactory = ZKTContracts.lockupContractFactory;

      //ZKT Staking and CommunityIssuance have not yet had their setters called, so are not yet
      // connected to the rest of the system
    });

    describe("CommunityIssuance deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(liquityAG, storedDeployerAddress);
      });
    });

    describe("ZKTStaking deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await zktStaking.owner();

        assert.equal(liquityAG, storedDeployerAddress);
      });
    });

    describe("ZKToken deployment", async (accounts) => {
      it("Stores the multisig's address", async () => {
        const storedMultisigAddress = await zkToken.multisigAddress();

        assert.equal(multisig, storedMultisigAddress);
      });

      it("Stores the CommunityIssuance address", async () => {
        const storedCIAddress = await zkToken.communityIssuanceAddress();

        assert.equal(communityIssuance.address, storedCIAddress);
      });

      it("Stores the LockupContractFactory address", async () => {
        const storedLCFAddress = await zkToken.lockupContractFactory();

        assert.equal(lockupContractFactory.address, storedLCFAddress);
      });

      it("Mints the correct ZKT amount to the multisig's address: (64.66 million)", async () => {
        const multisigZKTEntitlement = await zkToken.balanceOf(multisig);

        const twentyThreeSixes = "6".repeat(23);
        const expectedMultisigEntitlement = "64"
          .concat(twentyThreeSixes)
          .concat("7");
        assert.equal(multisigZKTEntitlement, expectedMultisigEntitlement);
      });

      it("Mints the correct ZKT amount to the CommunityIssuance contract address: 32 million", async () => {
        const communityZKTEntitlement = await zkToken.balanceOf(
          communityIssuance.address
        );
        // 32 million as 18-digit decimal
        const _32Million = dec(32, 24);

        assert.equal(communityZKTEntitlement, _32Million);
      });

      it("Mints the correct ZKT amount to the bountyAddress EOA: 2 million", async () => {
        const bountyAddressBal = await zkToken.balanceOf(bountyAddress);
        // 2 million as 18-digit decimal
        const _2Million = dec(2, 24);

        assert.equal(bountyAddressBal, _2Million);
      });

      it("Mints the correct ZKT amount to the lpRewardsAddress EOA: 1.33 million", async () => {
        const lpRewardsAddressBal = await zkToken.balanceOf(lpRewardsAddress);
        // 1.3 million as 18-digit decimal
        const _1pt33Million = "1".concat("3".repeat(24));

        assert.equal(lpRewardsAddressBal, _1pt33Million);
      });
    });

    describe("Community Issuance deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(storedDeployerAddress, liquityAG);
      });

      it("Has a supply cap of 32 million", async () => {
        const supplyCap = await communityIssuance.ZKTSupplyCap();

        assert.isTrue(expectedCISupplyCap.eq(supplyCap));
      });

      it("Liquity AG can set addresses if CI's ZKT balance is equal or greater than 32 million ", async () => {
        const ZKTBalance = await zkToken.balanceOf(communityIssuance.address);
        assert.isTrue(ZKTBalance.eq(expectedCISupplyCap));

        // Deploy core contracts, just to get the Stability Pool address
        const coreContracts = await deploymentHelper.deployLiquityCore();

        const tx = await communityIssuance.setAddresses(
          zkToken.address,
          coreContracts.stabilityPool.address,
          { from: liquityAG }
        );
        assert.isTrue(tx.receipt.status);
      });

      it("Liquity AG can't set addresses if CI's ZKT balance is < 32 million ", async () => {
        const newCI = await CommunityIssuance.new();

        const ZKTBalance = await zkToken.balanceOf(newCI.address);
        assert.equal(ZKTBalance, "0");

        // Deploy core contracts, just to get the Stability Pool address
        const coreContracts = await deploymentHelper.deployLiquityCore();

        await th.fastForwardTime(
          timeValues.SECONDS_IN_ONE_YEAR,
          web3.currentProvider
        );
        await zkToken.transfer(newCI.address, "31999999999999999999999999", {
          from: multisig,
        }); // 1e-18 less than CI expects (32 million)

        try {
          const tx = await newCI.setAddresses(
            zkToken.address,
            coreContracts.stabilityPool.address,
            { from: liquityAG }
          );

          // Check it gives the expected error message for a failed Solidity 'assert'
        } catch (err) {
          assert.include(err.message, "invalid opcode");
        }
      });
    });

    describe("Connecting ZKToken to LCF, CI and ZKTStaking", async (accounts) => {
      it("sets the correct ZKToken address in ZKTStaking", async () => {
        // Deploy core contracts and set the ZKToken address in the CI and ZKTStaking
        const coreContracts = await deploymentHelper.deployLiquityCore();
        await deploymentHelper.connectZKTContractsToCore(
          ZKTContracts,
          coreContracts
        );

        const zkTokenAddress = zkToken.address;

        const recordedZKTokenAddress = await zktStaking.zkToken();
        assert.equal(zkTokenAddress, recordedZKTokenAddress);
      });

      it("sets the correct ZKToken address in LockupContractFactory", async () => {
        const zkTokenAddress = zkToken.address;

        const recordedZKTokenAddress =
          await lockupContractFactory.zkTokenAddress();
        assert.equal(zkTokenAddress, recordedZKTokenAddress);
      });

      it("sets the correct ZKToken address in CommunityIssuance", async () => {
        // Deploy core contracts and set the ZKToken address in the CI and ZKTStaking
        const coreContracts = await deploymentHelper.deployLiquityCore();
        await deploymentHelper.connectZKTContractsToCore(
          ZKTContracts,
          coreContracts
        );

        const zkTokenAddress = zkToken.address;

        const recordedZKTokenAddress = await communityIssuance.zkToken();
        assert.equal(zkTokenAddress, recordedZKTokenAddress);
      });
    });
  }
);
