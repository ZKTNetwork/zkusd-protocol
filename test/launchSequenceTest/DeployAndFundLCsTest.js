const LockupContract = artifacts.require("./LockupContract.sol");

const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const { dec, toBN, assertRevert } = th;

contract(
  "Deploying and funding One Year Lockup Contracts",
  async (accounts) => {
    const [liquityAG, A, B, C, D, E, F, G, H, I, J] = accounts;

    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(
      997,
      1000
    );

    const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH;

    let ZKTContracts;

    // 1e24 = 1 million tokens with 18 decimal digits
    const ZKTEntitlement_A = dec(1, 24);
    const ZKTEntitlement_B = dec(2, 24);
    const ZKTEntitlement_C = dec(3, 24);
    const ZKTEntitlement_D = dec(4, 24);
    const ZKTEntitlement_E = dec(5, 24);

    let zktStaking;
    let zkToken;
    let communityIssuance;
    let lockupContractFactory;

    let oneYearFromSystemDeployment;

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

      oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(
        zkToken,
        web3,
        timeValues.SECONDS_IN_ONE_YEAR
      );
    });

    // --- LCs ---

    describe("Deploying LCs", async (accounts) => {
      it("ZKT Deployer can deploy LCs through the Factory", async () => {
        // ZKT deployer deploys LCs
        const LCDeploymentTx_A =
          await lockupContractFactory.deployLockupContract(
            A,
            oneYearFromSystemDeployment,
            { from: liquityAG }
          );
        const LCDeploymentTx_B =
          await lockupContractFactory.deployLockupContract(
            B,
            oneYearFromSystemDeployment,
            { from: liquityAG }
          );
        const LCDeploymentTx_C =
          await lockupContractFactory.deployLockupContract(
            C,
            oneYearFromSystemDeployment,
            { from: liquityAG }
          );

        assert.isTrue(LCDeploymentTx_A.receipt.status);
        assert.isTrue(LCDeploymentTx_B.receipt.status);
        assert.isTrue(LCDeploymentTx_C.receipt.status);
      });

      it("Anyone can deploy LCs through the Factory", async () => {
        // Various EOAs deploy LCs
        const LCDeploymentTx_1 =
          await lockupContractFactory.deployLockupContract(
            A,
            oneYearFromSystemDeployment,
            { from: G }
          );
        const LCDeploymentTx_2 =
          await lockupContractFactory.deployLockupContract(
            C,
            oneYearFromSystemDeployment,
            { from: H }
          );
        const LCDeploymentTx_3 =
          await lockupContractFactory.deployLockupContract(
            liquityAG,
            oneYearFromSystemDeployment,
            { from: I }
          );
        const LCDeploymentTx_4 =
          await lockupContractFactory.deployLockupContract(
            D,
            oneYearFromSystemDeployment,
            { from: J }
          );

        assert.isTrue(LCDeploymentTx_1.receipt.status);
        assert.isTrue(LCDeploymentTx_2.receipt.status);
        assert.isTrue(LCDeploymentTx_3.receipt.status);
        assert.isTrue(LCDeploymentTx_4.receipt.status);
      });

      it("ZKT Deployer can deploy LCs directly", async () => {
        // ZKT deployer deploys LCs
        const LC_A = await LockupContract.new(
          zkToken.address,
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const LC_A_txReceipt = await web3.eth.getTransactionReceipt(
          LC_A.transactionHash
        );

        const LC_B = await LockupContract.new(
          zkToken.address,
          B,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const LC_B_txReceipt = await web3.eth.getTransactionReceipt(
          LC_B.transactionHash
        );

        const LC_C = await LockupContract.new(
          zkToken.address,
          C,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const LC_C_txReceipt = await web3.eth.getTransactionReceipt(
          LC_C.transactionHash
        );

        // Check deployment succeeded
        assert.isTrue(LC_A_txReceipt.status);
        assert.isTrue(LC_B_txReceipt.status);
        assert.isTrue(LC_C_txReceipt.status);
      });

      it("Anyone can deploy LCs directly", async () => {
        // Various EOAs deploy LCs
        const LC_A = await LockupContract.new(
          zkToken.address,
          A,
          oneYearFromSystemDeployment,
          { from: D }
        );
        const LC_A_txReceipt = await web3.eth.getTransactionReceipt(
          LC_A.transactionHash
        );

        const LC_B = await LockupContract.new(
          zkToken.address,
          B,
          oneYearFromSystemDeployment,
          { from: E }
        );
        const LC_B_txReceipt = await web3.eth.getTransactionReceipt(
          LC_B.transactionHash
        );

        const LC_C = await LockupContract.new(
          zkToken.address,
          C,
          oneYearFromSystemDeployment,
          { from: F }
        );
        const LC_C_txReceipt = await web3.eth.getTransactionReceipt(
          LC_C.transactionHash
        );

        // Check deployment succeeded
        assert.isTrue(LC_A_txReceipt.status);
        assert.isTrue(LC_B_txReceipt.status);
        assert.isTrue(LC_C_txReceipt.status);
      });

      it("LC deployment stores the beneficiary's address in the LC", async () => {
        // Deploy 5 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_D = await lockupContractFactory.deployLockupContract(
          D,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_E = await lockupContractFactory.deployLockupContract(
          E,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );

        // Grab contracts from deployment tx events
        const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
        const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);
        const LC_D = await th.getLCFromDeploymentTx(deployedLCtx_D);
        const LC_E = await th.getLCFromDeploymentTx(deployedLCtx_E);

        const storedBeneficiaryAddress_A = await LC_A.beneficiary();
        const storedBeneficiaryAddress_B = await LC_B.beneficiary();
        const storedBeneficiaryAddress_C = await LC_C.beneficiary();
        const storedBeneficiaryAddress_D = await LC_D.beneficiary();
        const storedBeneficiaryAddress_E = await LC_E.beneficiary();

        assert.equal(A, storedBeneficiaryAddress_A);
        assert.equal(B, storedBeneficiaryAddress_B);
        assert.equal(C, storedBeneficiaryAddress_C);
        assert.equal(D, storedBeneficiaryAddress_D);
        assert.equal(E, storedBeneficiaryAddress_E);
      });

      it("LC deployment through the Factory registers the LC in the Factory", async () => {
        // Deploy 5 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_D = await lockupContractFactory.deployLockupContract(
          D,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_E = await lockupContractFactory.deployLockupContract(
          E,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );

        // Grab contract addresses from deployment tx events
        const LCAddress_A = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_A
        );
        const LCAddress_B = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_B
        );
        const LCAddress_C = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_C
        );
        const LCAddress_D = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_D
        );
        const LCAddress_E = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_E
        );

        assert.isTrue(
          await lockupContractFactory.isRegisteredLockup(LCAddress_A)
        );
        assert.isTrue(
          await lockupContractFactory.isRegisteredLockup(LCAddress_B)
        );
        assert.isTrue(
          await lockupContractFactory.isRegisteredLockup(LCAddress_C)
        );
        assert.isTrue(
          await lockupContractFactory.isRegisteredLockup(LCAddress_D)
        );
        assert.isTrue(
          await lockupContractFactory.isRegisteredLockup(LCAddress_E)
        );
      });

      it("LC deployment through the Factory records the LC contract address and deployer as a k-v pair in the Factory", async () => {
        // Deploy 5 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_D = await lockupContractFactory.deployLockupContract(
          D,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_E = await lockupContractFactory.deployLockupContract(
          E,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );

        // Grab contract addresses from deployment tx events
        const LCAddress_A = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_A
        );
        const LCAddress_B = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_B
        );
        const LCAddress_C = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_C
        );
        const LCAddress_D = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_D
        );
        const LCAddress_E = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_E
        );

        assert.equal(
          liquityAG,
          await lockupContractFactory.lockupContractToDeployer(LCAddress_A)
        );
        assert.equal(
          liquityAG,
          await lockupContractFactory.lockupContractToDeployer(LCAddress_B)
        );
        assert.equal(
          liquityAG,
          await lockupContractFactory.lockupContractToDeployer(LCAddress_C)
        );
        assert.equal(
          liquityAG,
          await lockupContractFactory.lockupContractToDeployer(LCAddress_D)
        );
        assert.equal(
          liquityAG,
          await lockupContractFactory.lockupContractToDeployer(LCAddress_E)
        );
      });

      it("LC deployment through the Factory sets the unlockTime in the LC", async () => {
        // Deploy 3 LCs through factory
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          "230582305895235",
          { from: B }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          dec(20, 18),
          { from: E }
        );

        // Grab contract objects from deployment events
        const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
        const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

        // Grab contract addresses from deployment tx events
        const unlockTime_A = await LC_A.unlockTime();
        const unlockTime_B = await LC_B.unlockTime();
        const unlockTime_C = await LC_C.unlockTime();

        // Check contracts have expected unlockTimes set
        assert.isTrue(unlockTime_A.eq(oneYearFromSystemDeployment));
        assert.isTrue(unlockTime_B.eq(toBN("230582305895235")));
        assert.isTrue(unlockTime_C.eq(toBN(dec(20, 18))));
      });

      it("Direct deployment of LC sets the unlockTime in the LC", async () => {
        // Deploy 3 LCs directly
        const LC_A = await LockupContract.new(
          zkToken.address,
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const LC_B = await LockupContract.new(
          zkToken.address,
          B,
          "230582305895235",
          { from: B }
        );
        const LC_C = await LockupContract.new(zkToken.address, C, dec(20, 18), {
          from: E,
        });

        // Grab contract addresses from deployment tx events
        const unlockTime_A = await LC_A.unlockTime();
        const unlockTime_B = await LC_B.unlockTime();
        const unlockTime_C = await LC_C.unlockTime();

        // Check contracts have expected unlockTimes set
        assert.isTrue(unlockTime_A.eq(oneYearFromSystemDeployment));
        assert.isTrue(unlockTime_B.eq(toBN("230582305895235")));
        assert.isTrue(unlockTime_C.eq(toBN(dec(20, 18))));
      });

      it("LC deployment through the Factory reverts when the unlockTime is < 1 year from system deployment", async () => {
        const nearlyOneYear = toBN(oneYearFromSystemDeployment).sub(toBN("60")); // 1 minute short of 1 year

        // Deploy 3 LCs through factory
        const LCDeploymentPromise_A =
          lockupContractFactory.deployLockupContract(A, nearlyOneYear, {
            from: liquityAG,
          });
        const LCDeploymentPromise_B =
          lockupContractFactory.deployLockupContract(B, "37", { from: B });
        const LCDeploymentPromise_C =
          lockupContractFactory.deployLockupContract(C, "43200", { from: E });

        // Confirm contract deployments revert
        await assertRevert(
          LCDeploymentPromise_A,
          "LockupContract: unlock time must be at least one year after system deployment"
        );
        await assertRevert(
          LCDeploymentPromise_B,
          "LockupContract: unlock time must be at least one year after system deployment"
        );
        await assertRevert(
          LCDeploymentPromise_C,
          "LockupContract: unlock time must be at least one year after system deployment"
        );
      });

      it("Direct deployment of LC reverts when the unlockTime is < 1 year from system deployment", async () => {
        const nearlyOneYear = toBN(oneYearFromSystemDeployment).sub(toBN("60")); // 1 minute short of 1 year

        // Deploy 3 LCs directly with unlockTime < 1 year from system deployment
        const LCDeploymentPromise_A = LockupContract.new(
          zkToken.address,
          A,
          nearlyOneYear,
          { from: liquityAG }
        );
        const LCDeploymentPromise_B = LockupContract.new(
          zkToken.address,
          B,
          "37",
          { from: B }
        );
        const LCDeploymentPromise_C = LockupContract.new(
          zkToken.address,
          C,
          "43200",
          { from: E }
        );

        // Confirm contract deployments revert
        await assertRevert(
          LCDeploymentPromise_A,
          "LockupContract: unlock time must be at least one year after system deployment"
        );
        await assertRevert(
          LCDeploymentPromise_B,
          "LockupContract: unlock time must be at least one year after system deployment"
        );
        await assertRevert(
          LCDeploymentPromise_C,
          "LockupContract: unlock time must be at least one year after system deployment"
        );
      });
    });

    describe("Funding LCs", async (accounts) => {
      it("ZKT transfer from ZKT deployer to their deployed LC increases the ZKT balance of the LC", async () => {
        // Deploy 5 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_D = await lockupContractFactory.deployLockupContract(
          D,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_E = await lockupContractFactory.deployLockupContract(
          E,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );

        // Grab contract addresses from deployment tx events
        const LCAddress_A = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_A
        );
        const LCAddress_B = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_B
        );
        const LCAddress_C = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_C
        );
        const LCAddress_D = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_D
        );
        const LCAddress_E = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_E
        );

        assert.equal(await zkToken.balanceOf(LCAddress_A), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_B), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_C), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_D), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_E), "0");

        // Multisig transfers ZKT to each LC
        await zkToken.transfer(LCAddress_A, ZKTEntitlement_A, {
          from: multisig,
        });
        await zkToken.transfer(LCAddress_B, ZKTEntitlement_B, {
          from: multisig,
        });
        await zkToken.transfer(LCAddress_C, ZKTEntitlement_C, {
          from: multisig,
        });
        await zkToken.transfer(LCAddress_D, ZKTEntitlement_D, {
          from: multisig,
        });
        await zkToken.transfer(LCAddress_E, ZKTEntitlement_E, {
          from: multisig,
        });

        assert.equal(await zkToken.balanceOf(LCAddress_A), ZKTEntitlement_A);
        assert.equal(await zkToken.balanceOf(LCAddress_B), ZKTEntitlement_B);
        assert.equal(await zkToken.balanceOf(LCAddress_C), ZKTEntitlement_C);
        assert.equal(await zkToken.balanceOf(LCAddress_D), ZKTEntitlement_D);
        assert.equal(await zkToken.balanceOf(LCAddress_E), ZKTEntitlement_E);
      });

      it("ZKT Multisig can transfer ZKT to LCs deployed through the factory by anyone", async () => {
        // Various accts deploy 5 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: F }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: G }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          oneYearFromSystemDeployment,
          { from: H }
        );
        const deployedLCtx_D = await lockupContractFactory.deployLockupContract(
          D,
          oneYearFromSystemDeployment,
          { from: I }
        );
        const deployedLCtx_E = await lockupContractFactory.deployLockupContract(
          E,
          oneYearFromSystemDeployment,
          { from: J }
        );

        // Grab contract addresses from deployment tx events
        const LCAddress_A = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_A
        );
        const LCAddress_B = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_B
        );
        const LCAddress_C = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_C
        );
        const LCAddress_D = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_D
        );
        const LCAddress_E = await th.getLCAddressFromDeploymentTx(
          deployedLCtx_E
        );

        assert.equal(await zkToken.balanceOf(LCAddress_A), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_B), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_C), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_D), "0");
        assert.equal(await zkToken.balanceOf(LCAddress_E), "0");

        // Multisig transfers ZKT to each LC
        await zkToken.transfer(LCAddress_A, dec(1, 18), { from: multisig });
        await zkToken.transfer(LCAddress_B, dec(2, 18), { from: multisig });
        await zkToken.transfer(LCAddress_C, dec(3, 18), { from: multisig });
        await zkToken.transfer(LCAddress_D, dec(4, 18), { from: multisig });
        await zkToken.transfer(LCAddress_E, dec(5, 18), { from: multisig });

        assert.equal(await zkToken.balanceOf(LCAddress_A), dec(1, 18));
        assert.equal(await zkToken.balanceOf(LCAddress_B), dec(2, 18));
        assert.equal(await zkToken.balanceOf(LCAddress_C), dec(3, 18));
        assert.equal(await zkToken.balanceOf(LCAddress_D), dec(4, 18));
        assert.equal(await zkToken.balanceOf(LCAddress_E), dec(5, 18));
      });

      // can't transfer ZKT to any LCs that were deployed directly
    });

    describe("Withdrawal attempts on funded, inactive LCs immediately after funding", async (accounts) => {
      it("Beneficiary can't withdraw from their funded LC", async () => {
        // Deploy 3 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );

        // Grab contract objects from deployment tx events
        const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
        const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

        // Multisig transfers ZKT to each LC
        await zkToken.transfer(LC_A.address, ZKTEntitlement_A, {
          from: multisig,
        });
        await zkToken.transfer(LC_B.address, ZKTEntitlement_B, {
          from: multisig,
        });
        await zkToken.transfer(LC_C.address, ZKTEntitlement_C, {
          from: multisig,
        });

        assert.equal(await zkToken.balanceOf(LC_A.address), ZKTEntitlement_A);
        assert.equal(await zkToken.balanceOf(LC_B.address), ZKTEntitlement_B);
        assert.equal(await zkToken.balanceOf(LC_C.address), ZKTEntitlement_C);

        const LCs = [LC_A, LC_B, LC_C];

        // Beneficiary attempts to withdraw
        for (LC of LCs) {
          try {
            const beneficiary = await LC.beneficiary();
            const withdrawalAttemptTx = await LC.withdrawZKT({
              from: beneficiary,
            });
            assert.isFalse(withdrawalAttemptTx.receipt.status);
          } catch (error) {
            assert.include(error.message, "revert");
          }
        }
      });

      it("ZKT multisig can't withraw from a LC which it funded", async () => {
        // Deploy 3 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );
        const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
          C,
          oneYearFromSystemDeployment,
          { from: liquityAG }
        );

        // Grab contract objects from deployment tx events
        const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
        const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

        // Multisig transfers ZKT to each LC
        await zkToken.transfer(LC_A.address, ZKTEntitlement_A, {
          from: multisig,
        });
        await zkToken.transfer(LC_B.address, ZKTEntitlement_B, {
          from: multisig,
        });
        await zkToken.transfer(LC_C.address, ZKTEntitlement_C, {
          from: multisig,
        });

        assert.equal(await zkToken.balanceOf(LC_A.address), ZKTEntitlement_A);
        assert.equal(await zkToken.balanceOf(LC_B.address), ZKTEntitlement_B);
        assert.equal(await zkToken.balanceOf(LC_C.address), ZKTEntitlement_C);

        const LCs = [LC_A, LC_B, LC_C];

        // ZKT multisig attempts to withdraw from LCs
        for (LC of LCs) {
          try {
            const withdrawalAttemptTx = await LC.withdrawZKT({
              from: multisig,
            });
            assert.isFalse(withdrawalAttemptTx.receipt.status);
          } catch (error) {
            assert.include(error.message, "revert");
          }
        }
      });

      it("No one can withraw from a LC", async () => {
        // Deploy 3 LCs
        const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
          A,
          ZKTEntitlement_A,
          { from: D }
        );

        // Grab contract objects from deployment tx events
        const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);

        // LiquityAG transfers ZKT to the LC
        await zkToken.transfer(LC_A.address, ZKTEntitlement_A, {
          from: multisig,
        });

        assert.equal(await zkToken.balanceOf(LC_A.address), ZKTEntitlement_A);

        // Various EOAs attempt to withdraw from LCs
        try {
          const withdrawalAttemptTx = await LC_A.withdrawZKT({ from: G });
          assert.isFalse(withdrawalAttemptTx.receipt.status);
        } catch (error) {
          assert.include(error.message, "revert");
        }

        try {
          const withdrawalAttemptTx = await LC_A.withdrawZKT({ from: H });
          assert.isFalse(withdrawalAttemptTx.receipt.status);
        } catch (error) {
          assert.include(error.message, "revert");
        }

        try {
          const withdrawalAttemptTx = await LC_A.withdrawZKT({ from: I });
          assert.isFalse(withdrawalAttemptTx.receipt.status);
        } catch (error) {
          assert.include(error.message, "revert");
        }
      });
    });
  }
);
