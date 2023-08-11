const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const { dec, toBN, assertRevert } = th;

contract("After the initial lockup period has passed", async (accounts) => {
  const [
    liquityAG,
    teamMember_1,
    teamMember_2,
    teamMember_3,
    investor_1,
    investor_2,
    investor_3,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  const SECONDS_IN_ONE_DAY = timeValues.SECONDS_IN_ONE_DAY;
  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH;
  const SECONDS_IN_ONE_YEAR = timeValues.SECONDS_IN_ONE_YEAR;
  const maxBytes32 = th.maxBytes32;

  let ZKTContracts;
  let coreContracts;

  // LCs for team members on vesting schedules
  let LC_T1;
  let LC_T2;
  let LC_T3;

  // LCs for investors
  let LC_I1;
  let LC_I2;
  let LC_I3;

  // 1e24 = 1 million tokens with 18 decimal digits
  const teamMemberInitialEntitlement_1 = dec(1, 24);
  const teamMemberInitialEntitlement_2 = dec(2, 24);
  const teamMemberInitialEntitlement_3 = dec(3, 24);

  const investorInitialEntitlement_1 = dec(4, 24);
  const investorInitialEntitlement_2 = dec(5, 24);
  const investorInitialEntitlement_3 = dec(6, 24);

  const teamMemberMonthlyVesting_1 = dec(1, 23);
  const teamMemberMonthlyVesting_2 = dec(2, 23);
  const teamMemberMonthlyVesting_3 = dec(3, 23);

  const ZKTEntitlement_A = dec(1, 24);
  const ZKTEntitlement_B = dec(2, 24);
  const ZKTEntitlement_C = dec(3, 24);
  const ZKTEntitlement_D = dec(4, 24);
  const ZKTEntitlement_E = dec(5, 24);

  let oneYearFromSystemDeployment;
  let twoYearsFromSystemDeployment;
  let justOverOneYearFromSystemDeployment;
  let _18monthsFromSystemDeployment;

  beforeEach(async () => {
    // Deploy all contracts from the first account
    ZKTContracts = await deploymentHelper.deployZKTTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );
    coreContracts = await deploymentHelper.deployLiquityCore();

    zktStaking = ZKTContracts.zktStaking;
    zkToken = ZKTContracts.zkToken;
    communityIssuance = ZKTContracts.communityIssuance;
    lockupContractFactory = ZKTContracts.lockupContractFactory;

    await deploymentHelper.connectZKTContracts(ZKTContracts);
    await deploymentHelper.connectCoreContracts(coreContracts, ZKTContracts);
    await deploymentHelper.connectZKTContractsToCore(
      ZKTContracts,
      coreContracts
    );

    oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(
      zkToken,
      web3,
      timeValues.SECONDS_IN_ONE_YEAR
    );
    justOverOneYearFromSystemDeployment = oneYearFromSystemDeployment.add(
      toBN("1")
    );

    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(
      toBN("2")
    );
    const secondsIn18Months = toBN(timeValues.SECONDS_IN_ONE_MONTH).mul(
      toBN("18")
    );
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      zkToken,
      web3,
      secondsInTwoYears
    );
    _18monthsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      zkToken,
      web3,
      secondsIn18Months
    );

    // Deploy 3 LCs for team members on vesting schedules
    const deployedLCtx_T1 = await lockupContractFactory.deployLockupContract(
      teamMember_1,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_T2 = await lockupContractFactory.deployLockupContract(
      teamMember_2,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_T3 = await lockupContractFactory.deployLockupContract(
      teamMember_3,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );

    const deployedLCtx_I1 = await lockupContractFactory.deployLockupContract(
      investor_1,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_I2 = await lockupContractFactory.deployLockupContract(
      investor_2,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_I3 = await lockupContractFactory.deployLockupContract(
      investor_3,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );

    // LCs for team members on vesting schedules
    LC_T1 = await th.getLCFromDeploymentTx(deployedLCtx_T1);
    LC_T2 = await th.getLCFromDeploymentTx(deployedLCtx_T2);
    LC_T3 = await th.getLCFromDeploymentTx(deployedLCtx_T3);

    // LCs for investors
    LC_I1 = await th.getLCFromDeploymentTx(deployedLCtx_I1);
    LC_I2 = await th.getLCFromDeploymentTx(deployedLCtx_I2);
    LC_I3 = await th.getLCFromDeploymentTx(deployedLCtx_I3);

    // Multisig transfers initial ZKT entitlements to LCs
    await zkToken.transfer(LC_T1.address, teamMemberInitialEntitlement_1, {
      from: multisig,
    });
    await zkToken.transfer(LC_T2.address, teamMemberInitialEntitlement_2, {
      from: multisig,
    });
    await zkToken.transfer(LC_T3.address, teamMemberInitialEntitlement_3, {
      from: multisig,
    });

    await zkToken.transfer(LC_I1.address, investorInitialEntitlement_1, {
      from: multisig,
    });
    await zkToken.transfer(LC_I2.address, investorInitialEntitlement_2, {
      from: multisig,
    });
    await zkToken.transfer(LC_I3.address, investorInitialEntitlement_3, {
      from: multisig,
    });

    const systemDeploymentTime = await zkToken.getDeploymentStartTime();

    // Every thirty days, mutlsig transfers vesting amounts to team members
    for (i = 0; i < 12; i++) {
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      await zkToken.transfer(LC_T1.address, teamMemberMonthlyVesting_1, {
        from: multisig,
      });
      await zkToken.transfer(LC_T2.address, teamMemberMonthlyVesting_2, {
        from: multisig,
      });
      await zkToken.transfer(LC_T3.address, teamMemberMonthlyVesting_3, {
        from: multisig,
      });
    }

    // After Since only 360 days have passed, fast forward 5 more days, until LCs unlock
    await th.fastForwardTime(SECONDS_IN_ONE_DAY * 5, web3.currentProvider);

    const endTime = toBN(await th.getLatestBlockTimestamp(web3));

    const timePassed = endTime.sub(systemDeploymentTime);
    // Confirm that just over one year has passed -  not more than 1000 seconds
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).lt(toBN("1000")));
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).gt(toBN("0")));
  });

  describe("Deploying new LCs", async (accounts) => {
    it("ZKT Deployer can deploy new LCs", async () => {
      // ZKT deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(
        C,
        "9595995999999900000023423234",
        { from: liquityAG }
      );

      assert.isTrue(LCDeploymentTx_A.receipt.status);
      assert.isTrue(LCDeploymentTx_B.receipt.status);
      assert.isTrue(LCDeploymentTx_C.receipt.status);
    });

    it("Anyone can deploy new LCs", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        C,
        oneYearFromSystemDeployment,
        { from: investor_2 }
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        liquityAG,
        "9595995999999900000023423234",
        { from: A }
      );

      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);
    });

    it("Anyone can deploy new LCs with unlockTime in the past", async () => {
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: E }
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        C,
        _18monthsFromSystemDeployment,
        { from: multisig }
      );

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);
      const LC_3 = await th.getLCFromDeploymentTx(LCDeploymentTx_3);

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);

      // Check LCs have unlockTimes in the past
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();
      unlockTime_3 = await LC_3.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.lt(currentTime));
      assert.isTrue(unlockTime_2.lt(currentTime));
      assert.isTrue(unlockTime_3.lt(currentTime));
    });

    it("Anyone can deploy new LCs with unlockTime in the future", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        twoYearsFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: E }
      );

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);

      // Check LCs have unlockTimes in the future
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.gt(currentTime));
      assert.isTrue(unlockTime_2.gt(currentTime));
    });
  });

  describe("Beneficiary withdrawal from initial LC", async (accounts) => {
    it("A beneficiary can withdraw their full entitlement from their LC", async () => {
      // Check ZKT balances of investors' LCs are equal to their initial entitlements
      assert.equal(
        await zkToken.balanceOf(LC_I1.address),
        investorInitialEntitlement_1
      );
      assert.equal(
        await zkToken.balanceOf(LC_I2.address),
        investorInitialEntitlement_2
      );
      assert.equal(
        await zkToken.balanceOf(LC_I3.address),
        investorInitialEntitlement_3
      );

      // Check ZKT balances of investors are 0
      assert.equal(await zkToken.balanceOf(investor_1), "0");
      assert.equal(await zkToken.balanceOf(investor_2), "0");
      assert.equal(await zkToken.balanceOf(investor_3), "0");

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawZKT({ from: investor_1 });
      await LC_I2.withdrawZKT({ from: investor_2 });
      await LC_I3.withdrawZKT({ from: investor_3 });

      // Check ZKT balances of investors now equal their entitlements
      assert.equal(
        await zkToken.balanceOf(investor_1),
        investorInitialEntitlement_1
      );
      assert.equal(
        await zkToken.balanceOf(investor_2),
        investorInitialEntitlement_2
      );
      assert.equal(
        await zkToken.balanceOf(investor_3),
        investorInitialEntitlement_3
      );

      // Check ZKT balances of investors' LCs are now 0
      assert.equal(await zkToken.balanceOf(LC_I1.address), "0");
      assert.equal(await zkToken.balanceOf(LC_I2.address), "0");
      assert.equal(await zkToken.balanceOf(LC_I3.address), "0");
    });

    it("A beneficiary on a vesting schedule can withdraw their total vested amount from their LC", async () => {
      // Get ZKT balances of LCs for beneficiaries (team members) on vesting schedules
      const ZKTBalanceOfLC_T1_Before = await zkToken.balanceOf(LC_T1.address);
      const ZKTBalanceOfLC_T2_Before = await zkToken.balanceOf(LC_T2.address);
      const ZKTBalanceOfLC_T3_Before = await zkToken.balanceOf(LC_T3.address);

      // Check ZKT balances of vesting beneficiaries' LCs are greater than their initial entitlements
      assert.isTrue(
        ZKTBalanceOfLC_T1_Before.gt(th.toBN(teamMemberInitialEntitlement_1))
      );
      assert.isTrue(
        ZKTBalanceOfLC_T2_Before.gt(th.toBN(teamMemberInitialEntitlement_2))
      );
      assert.isTrue(
        ZKTBalanceOfLC_T3_Before.gt(th.toBN(teamMemberInitialEntitlement_3))
      );

      // Check ZKT balances of beneficiaries are 0
      assert.equal(await zkToken.balanceOf(teamMember_1), "0");
      assert.equal(await zkToken.balanceOf(teamMember_2), "0");
      assert.equal(await zkToken.balanceOf(teamMember_3), "0");

      // All beneficiaries withdraw from their respective LCs
      await LC_T1.withdrawZKT({ from: teamMember_1 });
      await LC_T2.withdrawZKT({ from: teamMember_2 });
      await LC_T3.withdrawZKT({ from: teamMember_3 });

      // Check beneficiaries' ZKT balances now equal their accumulated vested entitlements
      assert.isTrue(
        (await zkToken.balanceOf(teamMember_1)).eq(ZKTBalanceOfLC_T1_Before)
      );
      assert.isTrue(
        (await zkToken.balanceOf(teamMember_2)).eq(ZKTBalanceOfLC_T2_Before)
      );
      assert.isTrue(
        (await zkToken.balanceOf(teamMember_3)).eq(ZKTBalanceOfLC_T3_Before)
      );

      // Check ZKT balances of beneficiaries' LCs are now 0
      assert.equal(await zkToken.balanceOf(LC_T1.address), "0");
      assert.equal(await zkToken.balanceOf(LC_T2.address), "0");
      assert.equal(await zkToken.balanceOf(LC_T3.address), "0");
    });

    it("Beneficiaries can withraw full ZKT balance of LC if it has increased since lockup period ended", async () => {
      // Check ZKT balances of investors' LCs are equal to their initial entitlements
      assert.equal(
        await zkToken.balanceOf(LC_I1.address),
        investorInitialEntitlement_1
      );
      assert.equal(
        await zkToken.balanceOf(LC_I2.address),
        investorInitialEntitlement_2
      );
      assert.equal(
        await zkToken.balanceOf(LC_I3.address),
        investorInitialEntitlement_3
      );

      // Check ZKT balances of investors are 0
      assert.equal(await zkToken.balanceOf(investor_1), "0");
      assert.equal(await zkToken.balanceOf(investor_2), "0");
      assert.equal(await zkToken.balanceOf(investor_3), "0");

      // ZKT multisig sends extra ZKT to investor LCs
      await zkToken.transfer(LC_I1.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_I2.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_I3.address, dec(1, 24), { from: multisig });

      // 1 month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ZKT multisig again sends extra ZKT to investor LCs
      await zkToken.transfer(LC_I1.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_I2.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_I3.address, dec(1, 24), { from: multisig });

      // Get ZKT balances of LCs for investors
      const ZKTBalanceOfLC_I1_Before = await zkToken.balanceOf(LC_I1.address);
      const ZKTBalanceOfLC_I2_Before = await zkToken.balanceOf(LC_I2.address);
      const ZKTBalanceOfLC_I3_Before = await zkToken.balanceOf(LC_I3.address);

      // Check ZKT balances of investors' LCs are greater than their initial entitlements
      assert.isTrue(
        ZKTBalanceOfLC_I1_Before.gt(th.toBN(investorInitialEntitlement_1))
      );
      assert.isTrue(
        ZKTBalanceOfLC_I2_Before.gt(th.toBN(investorInitialEntitlement_2))
      );
      assert.isTrue(
        ZKTBalanceOfLC_I3_Before.gt(th.toBN(investorInitialEntitlement_3))
      );

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawZKT({ from: investor_1 });
      await LC_I2.withdrawZKT({ from: investor_2 });
      await LC_I3.withdrawZKT({ from: investor_3 });

      // Check ZKT balances of investors now equal their LC balances prior to withdrawal
      assert.isTrue(
        (await zkToken.balanceOf(investor_1)).eq(ZKTBalanceOfLC_I1_Before)
      );
      assert.isTrue(
        (await zkToken.balanceOf(investor_2)).eq(ZKTBalanceOfLC_I2_Before)
      );
      assert.isTrue(
        (await zkToken.balanceOf(investor_3)).eq(ZKTBalanceOfLC_I3_Before)
      );

      // Check ZKT balances of investors' LCs are now 0
      assert.equal(await zkToken.balanceOf(LC_I1.address), "0");
      assert.equal(await zkToken.balanceOf(LC_I2.address), "0");
      assert.equal(await zkToken.balanceOf(LC_I3.address), "0");
    });
  });

  describe("Withdrawal attempts from LCs by non-beneficiaries", async (accounts) => {
    it("ZKT Multisig can't withdraw from a LC they deployed through the Factory", async () => {
      try {
        const withdrawalAttempt = await LC_T1.withdrawZKT({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("ZKT Multisig can't withdraw from a LC that someone else deployed", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //ZKT multisig fund the newly deployed LCs
      await zkToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // ZKT multisig attempts withdrawal from LC
      try {
        const withdrawalAttempt_B = await LC_B.withdrawZKT({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("Non-beneficiaries cannot withdraw from a LC", async () => {
      const variousEOAs = [
        teamMember_1,
        teamMember_3,
        liquityAG,
        investor_1,
        investor_2,
        investor_3,
        A,
        B,
        C,
        D,
        E,
      ];

      // Several EOAs attempt to withdraw from the LC that has teamMember_2 as beneficiary
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_T2.withdrawZKT({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      }
    });
  });

  describe("Transferring ZKT", async (accounts) => {
    it("ZKT multisig can transfer ZKT to LCs they deployed", async () => {
      const initialZKTBalanceOfLC_T1 = await zkToken.balanceOf(LC_T1.address);
      const initialZKTBalanceOfLC_T2 = await zkToken.balanceOf(LC_T2.address);
      const initialZKTBalanceOfLC_T3 = await zkToken.balanceOf(LC_T3.address);

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ZKT multisig transfers vesting amount
      await zkToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC ZKT balances
      const ZKTBalanceOfLC_T1_1 = await zkToken.balanceOf(LC_T1.address);
      const ZKTBalanceOfLC_T2_1 = await zkToken.balanceOf(LC_T2.address);
      const ZKTBalanceOfLC_T3_1 = await zkToken.balanceOf(LC_T3.address);

      // // Check team member LC balances have increased
      assert.isTrue(
        ZKTBalanceOfLC_T1_1.eq(
          th.toBN(initialZKTBalanceOfLC_T1).add(th.toBN(dec(1, 24)))
        )
      );
      assert.isTrue(
        ZKTBalanceOfLC_T2_1.eq(
          th.toBN(initialZKTBalanceOfLC_T2).add(th.toBN(dec(1, 24)))
        )
      );
      assert.isTrue(
        ZKTBalanceOfLC_T3_1.eq(
          th.toBN(initialZKTBalanceOfLC_T3).add(th.toBN(dec(1, 24)))
        )
      );

      // Another month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ZKT multisig transfers vesting amount
      await zkToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC ZKT balances
      const ZKTBalanceOfLC_T1_2 = await zkToken.balanceOf(LC_T1.address);
      const ZKTBalanceOfLC_T2_2 = await zkToken.balanceOf(LC_T2.address);
      const ZKTBalanceOfLC_T3_2 = await zkToken.balanceOf(LC_T3.address);

      // Check team member LC balances have increased again
      assert.isTrue(
        ZKTBalanceOfLC_T1_2.eq(ZKTBalanceOfLC_T1_1.add(th.toBN(dec(1, 24))))
      );
      assert.isTrue(
        ZKTBalanceOfLC_T2_2.eq(ZKTBalanceOfLC_T2_1.add(th.toBN(dec(1, 24))))
      );
      assert.isTrue(
        ZKTBalanceOfLC_T3_2.eq(ZKTBalanceOfLC_T3_1.add(th.toBN(dec(1, 24))))
      );
    });

    it("ZKT multisig can transfer tokens to LCs deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract ith themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: A }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        justOverOneYearFromSystemDeployment,
        { from: B }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: C }
      );

      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await zkToken.balanceOf(LC_A.address), "0");
      assert.equal(await zkToken.balanceOf(LC_B.address), "0");
      assert.equal(await zkToken.balanceOf(LC_C.address), "0");

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ZKT multisig transfers ZKT to LCs deployed by other accounts
      await zkToken.transfer(LC_A.address, dec(1, 24), { from: multisig });
      await zkToken.transfer(LC_B.address, dec(2, 24), { from: multisig });
      await zkToken.transfer(LC_C.address, dec(3, 24), { from: multisig });

      // Check balances of LCs have increased
      assert.equal(await zkToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await zkToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await zkToken.balanceOf(LC_C.address), dec(3, 24));
    });

    it("ZKT multisig can transfer ZKT directly to any externally owned account", async () => {
      // Check ZKT balances of EOAs
      assert.equal(await zkToken.balanceOf(A), "0");
      assert.equal(await zkToken.balanceOf(B), "0");
      assert.equal(await zkToken.balanceOf(C), "0");

      // ZKT multisig transfers ZKT to EOAs
      const txA = await zkToken.transfer(A, dec(1, 24), { from: multisig });
      const txB = await zkToken.transfer(B, dec(2, 24), { from: multisig });
      const txC = await zkToken.transfer(C, dec(3, 24), { from: multisig });

      // Check new balances have increased by correct amount
      assert.equal(await zkToken.balanceOf(A), dec(1, 24));
      assert.equal(await zkToken.balanceOf(B), dec(2, 24));
      assert.equal(await zkToken.balanceOf(C), dec(3, 24));
    });

    it("Anyone can transfer ZKT to LCs deployed by anyone", async () => {
      // Start D, E, F with some ZKT
      await zkToken.transfer(D, dec(1, 24), { from: multisig });
      await zkToken.transfer(E, dec(2, 24), { from: multisig });
      await zkToken.transfer(F, dec(3, 24), { from: multisig });

      // H, I, J deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: H }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        justOverOneYearFromSystemDeployment,
        { from: I }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: J }
      );

      // Grab contract addresses from deployment tx events
      const LCAddress_A = await th.getLCAddressFromDeploymentTx(deployedLCtx_A);
      const LCAddress_B = await th.getLCAddressFromDeploymentTx(deployedLCtx_B);
      const LCAddress_C = await th.getLCAddressFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await zkToken.balanceOf(LCAddress_A), "0");
      assert.equal(await zkToken.balanceOf(LCAddress_B), "0");
      assert.equal(await zkToken.balanceOf(LCAddress_C), "0");

      // D, E, F transfer ZKT to LCs
      await zkToken.transfer(LCAddress_A, dec(1, 24), { from: D });
      await zkToken.transfer(LCAddress_B, dec(2, 24), { from: E });
      await zkToken.transfer(LCAddress_C, dec(3, 24), { from: F });

      // Check balances of LCs has increased
      assert.equal(await zkToken.balanceOf(LCAddress_A), dec(1, 24));
      assert.equal(await zkToken.balanceOf(LCAddress_B), dec(2, 24));
      assert.equal(await zkToken.balanceOf(LCAddress_C), dec(3, 24));
    });

    it("Anyone can transfer to an EOA", async () => {
      // Start D, E, liquityAG with some ZKT
      await zkToken.unprotectedMint(D, dec(1, 24));
      await zkToken.unprotectedMint(E, dec(2, 24));
      await zkToken.unprotectedMint(liquityAG, dec(3, 24));
      await zkToken.unprotectedMint(multisig, dec(4, 24));

      // ZKT holders transfer to other EOAs
      const ZKTtransferTx_1 = await zkToken.transfer(A, dec(1, 18), {
        from: D,
      });
      const ZKTtransferTx_2 = await zkToken.transfer(liquityAG, dec(1, 18), {
        from: E,
      });
      const ZKTtransferTx_3 = await zkToken.transfer(F, dec(1, 18), {
        from: liquityAG,
      });
      const ZKTtransferTx_4 = await zkToken.transfer(G, dec(1, 18), {
        from: multisig,
      });

      assert.isTrue(ZKTtransferTx_1.receipt.status);
      assert.isTrue(ZKTtransferTx_2.receipt.status);
      assert.isTrue(ZKTtransferTx_3.receipt.status);
      assert.isTrue(ZKTtransferTx_4.receipt.status);
    });

    it("Anyone can approve any EOA to spend their ZKT", async () => {
      // EOAs approve EOAs to spend ZKT
      const ZKTapproveTx_1 = await zkToken.approve(A, dec(1, 18), {
        from: multisig,
      });
      const ZKTapproveTx_2 = await zkToken.approve(B, dec(1, 18), {
        from: G,
      });
      const ZKTapproveTx_3 = await zkToken.approve(liquityAG, dec(1, 18), {
        from: F,
      });
      await assert.isTrue(ZKTapproveTx_1.receipt.status);
      await assert.isTrue(ZKTapproveTx_2.receipt.status);
      await assert.isTrue(ZKTapproveTx_3.receipt.status);
    });

    it("Anyone can increaseAllowance for any EOA or Liquity contract", async () => {
      // Anyone can increaseAllowance of EOAs to spend ZKT
      const ZKTIncreaseAllowanceTx_1 = await zkToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: multisig }
      );
      const ZKTIncreaseAllowanceTx_2 = await zkToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: G }
      );
      const ZKTIncreaseAllowanceTx_3 = await zkToken.increaseAllowance(
        multisig,
        dec(1, 18),
        { from: F }
      );
      await assert.isTrue(ZKTIncreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(ZKTIncreaseAllowanceTx_2.receipt.status);
      await assert.isTrue(ZKTIncreaseAllowanceTx_3.receipt.status);

      // Increase allowance of Liquity contracts from F
      for (const contract of Object.keys(coreContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of Liquity contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of ZKT contracts from F
      for (const contract of Object.keys(ZKTContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.increaseAllowance(
          ZKTContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of LQT contracts from multisig
      for (const contract of Object.keys(ZKTContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.increaseAllowance(
          ZKTContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone can decreaseAllowance for any EOA or Liquity contract", async () => {
      //First, increase allowance of A, B LiqAG and core contracts
      const ZKTapproveTx_1 = await zkToken.approve(A, dec(1, 18), {
        from: multisig,
      });
      const ZKTapproveTx_2 = await zkToken.approve(B, dec(1, 18), {
        from: G,
      });
      const ZKTapproveTx_3 = await zkToken.approve(multisig, dec(1, 18), {
        from: F,
      });
      await assert.isTrue(ZKTapproveTx_1.receipt.status);
      await assert.isTrue(ZKTapproveTx_2.receipt.status);
      await assert.isTrue(ZKTapproveTx_3.receipt.status);

      // --- SETUP ---

      // IncreaseAllowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const ZKTtransferTx = await zkToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(ZKTtransferTx.receipt.status);
      }

      // IncreaseAllowance of core contracts, from multisig
      for (const contract of Object.keys(coreContracts)) {
        const ZKTtransferTx = await zkToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(ZKTtransferTx.receipt.status);
      }

      // Increase allowance of ZKT contracts from F
      for (const contract of Object.keys(ZKTContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.increaseAllowance(
          ZKTContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of LQTT contracts from multisig
      for (const contract of Object.keys(ZKTContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.increaseAllowance(
          ZKTContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }

      // --- TEST ---

      // Decrease allowance of A, B, multisig
      const ZKTDecreaseAllowanceTx_1 = await zkToken.decreaseAllowance(
        A,
        dec(1, 18),
        { from: multisig }
      );
      const ZKTDecreaseAllowanceTx_2 = await zkToken.decreaseAllowance(
        B,
        dec(1, 18),
        { from: G }
      );
      const ZKTDecreaseAllowanceTx_3 = await zkToken.decreaseAllowance(
        multisig,
        dec(1, 18),
        { from: F }
      );
      await assert.isTrue(ZKTDecreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(ZKTDecreaseAllowanceTx_2.receipt.status);
      await assert.isTrue(ZKTDecreaseAllowanceTx_3.receipt.status);

      // Decrease allowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const ZKTDecreaseAllowanceTx = await zkToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(ZKTDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of core contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const ZKTDecreaseAllowanceTx = await zkToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(ZKTDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of ZKT contracts from F
      for (const contract of Object.keys(ZKTContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.decreaseAllowance(
          ZKTContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of ZKT contracts from multisig
      for (const contract of Object.keys(ZKTContracts)) {
        const ZKTIncreaseAllowanceTx = await zkToken.decreaseAllowance(
          ZKTContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(ZKTIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone can be the sender in a transferFrom() call", async () => {
      // Fund B, C
      await zkToken.unprotectedMint(B, dec(1, 18));
      await zkToken.unprotectedMint(C, dec(1, 18));

      // LiqAG, B, C approve F, G, multisig respectively
      await zkToken.approve(F, dec(1, 18), { from: multisig });
      await zkToken.approve(G, dec(1, 18), { from: B });
      await zkToken.approve(multisig, dec(1, 18), { from: C });

      // Approved addresses transfer from the address they're approved for
      const ZKTtransferFromTx_1 = await zkToken.transferFrom(
        multisig,
        F,
        dec(1, 18),
        { from: F }
      );
      const ZKTtransferFromTx_2 = await zkToken.transferFrom(
        B,
        multisig,
        dec(1, 18),
        { from: G }
      );
      const ZKTtransferFromTx_3 = await zkToken.transferFrom(C, A, dec(1, 18), {
        from: multisig,
      });
      await assert.isTrue(ZKTtransferFromTx_1.receipt.status);
      await assert.isTrue(ZKTtransferFromTx_2.receipt.status);
      await assert.isTrue(ZKTtransferFromTx_3.receipt.status);
    });

    it("Anyone can stake their ZKT in the staking contract", async () => {
      // Fund F
      await zkToken.unprotectedMint(F, dec(1, 18));

      const ZKTStakingTx_1 = await zktStaking.stake(dec(1, 18), { from: F });
      const ZKTStakingTx_2 = await zktStaking.stake(dec(1, 18), {
        from: multisig,
      });
      await assert.isTrue(ZKTStakingTx_1.receipt.status);
      await assert.isTrue(ZKTStakingTx_2.receipt.status);
    });
  });

  describe("Withdrawal Attempts on new LCs before unlockTime has passed", async (accounts) => {
    it("ZKT Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, before the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // ZKT multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawZKT({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("ZKT Deployer can't withdraw from a funded LC that someone else deployed, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //ZKT multisig fund the newly deployed LCs
      await zkToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // ZKT multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawZKT({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("Beneficiary can't withdraw from their funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ZKT multisig funds contracts
      await zkToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      try {
        const beneficiary = await LC_B.beneficiary();
        const withdrawalAttempt = await LC_B.withdrawZKT({
          from: beneficiary,
        });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: The lockup duration must have passed"
        );
      }
    });

    it("No one can withdraw from a beneficiary's funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ZKT multisig funds contracts
      await zkToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      const variousEOAs = [teamMember_2, multisig, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawZKT({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      }
    });
  });

  describe("Withdrawals from new LCs after unlockTime has passed", async (accounts) => {
    it("ZKT Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, after the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // ZKT multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawZKT({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("ZKT multisig can't withdraw from a funded LC when they are not the beneficiary, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //ZKT multisig fund the newly deployed LC
      await zkToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // ZKT multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawZKT({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("Beneficiary can withdraw from their funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ZKT multisig funds contract
      await zkToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const beneficiary = await LC_B.beneficiary();
      assert.equal(beneficiary, B);

      // Get B's balance before
      const B_balanceBefore = await zkToken.balanceOf(B);
      assert.equal(B_balanceBefore, "0");

      const withdrawalAttempt = await LC_B.withdrawZKT({ from: B });
      assert.isTrue(withdrawalAttempt.receipt.status);

      // Get B's balance after
      const B_balanceAfter = await zkToken.balanceOf(B);
      assert.equal(B_balanceAfter, dec(2, 18));
    });

    it("Non-beneficiaries can't withdraw from a beneficiary's funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ZKT multisig funds contracts
      await zkToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const variousEOAs = [teamMember_2, liquityAG, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawZKT({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      }
    });
  });
});
