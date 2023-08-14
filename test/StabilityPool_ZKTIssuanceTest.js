const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;
const toBN = th.toBN;
const getDifference = th.getDifference;

const TroveManagerTester = artifacts.require("TroveManagerTester");
const ZKUSDToken = artifacts.require("ZKUSDToken");

const GAS_PRICE = 10000000;

contract("StabilityPool - ZKT Rewards", async (accounts) => {
  const [
    owner,
    whale,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    defaulter_1,
    defaulter_2,
    defaulter_3,
    defaulter_4,
    defaulter_5,
    defaulter_6,
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  let contracts;

  let priceFeed;
  let zkusdToken;
  let stabilityPool;
  let sortedTroves;
  let troveManager;
  let borrowerOperations;
  let zkToken;
  let communityIssuanceTester;

  let communityZKTSupply;
  let issuance_M1;
  let issuance_M2;
  let issuance_M3;
  let issuance_M4;
  let issuance_M5;
  let issuance_M6;

  const ZERO_ADDRESS = th.ZERO_ADDRESS;

  const getOpenTroveZKUSDAmount = async (totalDebt) =>
    th.getOpenTroveZKUSDAmount(contracts, totalDebt);

  const openTrove = async (params) => th.openTrove(contracts, params);
  describe("ZKT Rewards", async () => {
    beforeEach(async () => {
      contracts = await deploymentHelper.deployLiquityCore();
      contracts.troveManager = await TroveManagerTester.new();
      contracts.zkusdToken = await ZKUSDToken.new(
        contracts.troveManager.address,
        contracts.stabilityPool.address,
        contracts.borrowerOperations.address
      );
      const ZKTContracts =
        await deploymentHelper.deployZKTTesterContractsHardhat(
          bountyAddress,
          lpRewardsAddress,
          multisig
        );

      priceFeed = contracts.priceFeedTestnet;
      zkusdToken = contracts.zkusdToken;
      stabilityPool = contracts.stabilityPool;
      sortedTroves = contracts.sortedTroves;
      troveManager = contracts.troveManager;
      stabilityPool = contracts.stabilityPool;
      borrowerOperations = contracts.borrowerOperations;

      zkToken = ZKTContracts.zkToken;
      communityIssuanceTester = ZKTContracts.communityIssuance;

      await stabilityPool.setDefaultKickbackRate(toBN("1000000000000000000"));
      await deploymentHelper.connectZKTContracts(ZKTContracts);
      await deploymentHelper.connectCoreContracts(contracts, ZKTContracts);
      await deploymentHelper.connectZKTContractsToCore(ZKTContracts, contracts);

      // Check community issuance starts with 32 million ZKT
      communityZKTSupply = toBN(
        await zkToken.balanceOf(communityIssuanceTester.address)
      );
      assert.isAtMost(
        getDifference(communityZKTSupply, "32000000000000000000000000"),
        1000
      );

      /* Monthly ZKT issuance

              Expected fraction of total supply issued per month, for a yearly halving schedule
              (issuance in each month, not cumulative):

              Month 1: 0.055378538087966600
              Month 2: 0.052311755607206100
              Month 3: 0.049414807056864200
              Month 4: 0.046678287282156100
              Month 5: 0.044093311972020200
              Month 6: 0.041651488815552900
            */

      issuance_M1 = toBN("55378538087966600")
        .mul(communityZKTSupply)
        .div(toBN(dec(1, 18)));
      issuance_M2 = toBN("52311755607206100")
        .mul(communityZKTSupply)
        .div(toBN(dec(1, 18)));
      issuance_M3 = toBN("49414807056864200")
        .mul(communityZKTSupply)
        .div(toBN(dec(1, 18)));
      issuance_M4 = toBN("46678287282156100")
        .mul(communityZKTSupply)
        .div(toBN(dec(1, 18)));
      issuance_M5 = toBN("44093311972020200")
        .mul(communityZKTSupply)
        .div(toBN(dec(1, 18)));
      issuance_M6 = toBN("41651488815552900")
        .mul(communityZKTSupply)
        .div(toBN(dec(1, 18)));
    });

    it("liquidation < 1 minute after a deposit does not change totalZKTIssued", async () => {
      await openTrove({
        extraZKUSDAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraZKUSDAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });

      // A, B provide to SP
      await stabilityPool.provideToSP(dec(10000, 18), {
        from: A,
      });
      await stabilityPool.provideToSP(dec(5000, 18), { from: B });

      await th.fastForwardTime(
        timeValues.MINUTES_IN_ONE_WEEK,
        web3.currentProvider
      );

      await priceFeed.setPrice(dec(105, 18));

      // B adjusts, triggering ZKT issuance for all
      await stabilityPool.provideToSP(dec(1, 18), { from: B });
      const blockTimestamp_1 = th.toBN(await th.getLatestBlockTimestamp(web3));

      // Check ZKT has been issued
      const totalZKTIssued_1 = await communityIssuanceTester.totalZKTIssued();
      assert.isTrue(totalZKTIssued_1.gt(toBN("0")));

      await troveManager.liquidate(B);
      const blockTimestamp_2 = th.toBN(await th.getLatestBlockTimestamp(web3));

      assert.isFalse(await sortedTroves.contains(B));

      const totalZKTIssued_2 = await communityIssuanceTester.totalZKTIssued();

      //console.log(`totalZKTIssued_1: ${totalZKTIssued_1}`)
      //console.log(`totalZKTIssued_2: ${totalZKTIssued_2}`)

      // check blockTimestamp diff < 60s
      const timestampDiff = blockTimestamp_2.sub(blockTimestamp_1);
      assert.isTrue(timestampDiff.lt(toBN(60)));

      // Check that the liquidation did not alter total ZKT issued
      assert.isTrue(totalZKTIssued_2.eq(totalZKTIssued_1));

      // Check that depositor B has no ZKT gain
      const B_pendingZKTGain = await stabilityPool.getDepositorZKTGain(B);
      assert.equal(B_pendingZKTGain, "0");

      // Check depositor B has a pending NEON gain
      const B_pendingNEONGain = await stabilityPool.getDepositorNEONGain(B);
      assert.isTrue(B_pendingNEONGain.gt(toBN("0")));
    });

    it("withdrawFromSP(): reward term G does not update when no ZKT is issued", async () => {
      await borrowerOperations.openTrove(th._100pct, dec(10000, 18), A, A, {
        from: A,
        value: dec(1000, "ether"),
      });
      await stabilityPool.provideToSP(dec(10000, 18), {
        from: A,
      });

      const A_initialDeposit = (await stabilityPool.deposits(A)).toString();
      assert.equal(A_initialDeposit, dec(10000, 18));

      // defaulter opens trove
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(10000, 18)),
        defaulter_1,
        defaulter_1,
        { from: defaulter_1, value: dec(100, "ether") }
      );

      // NEON drops
      await priceFeed.setPrice(dec(100, 18));

      await th.fastForwardTime(
        timeValues.MINUTES_IN_ONE_WEEK,
        web3.currentProvider
      );

      // Liquidate d1. Triggers issuance.
      await troveManager.liquidate(defaulter_1);
      assert.isFalse(await sortedTroves.contains(defaulter_1));

      // Get G and communityIssuance before
      const G_Before = await stabilityPool.epochToScaleToG(0, 0);
      const ZKTIssuedBefore = await communityIssuanceTester.totalZKTIssued();

      //  A withdraws some deposit. Triggers issuance.
      const tx = await stabilityPool.withdrawFromSP(1000, {
        from: A,
        gasPrice: GAS_PRICE,
      });
      assert.isTrue(tx.receipt.status);

      // Check G and ZKTIssued do not increase, since <1 minute has passed between issuance triggers
      const G_After = await stabilityPool.epochToScaleToG(0, 0);
      const ZKTIssuedAfter = await communityIssuanceTester.totalZKTIssued();

      assert.isTrue(G_After.eq(G_Before));
      assert.isTrue(ZKTIssuedAfter.eq(ZKTIssuedBefore));
    });

    // using the result of this to advance time by the desired amount from the deployment time, whether or not some extra time has passed in the meanwhile
    const getDuration = async (expectedDuration) => {
      const deploymentTime = (
        await communityIssuanceTester.deploymentTime()
      ).toNumber();
      const currentTime = await th.getLatestBlockTimestamp(web3);
      const duration = Math.max(
        expectedDuration - (currentTime - deploymentTime),
        0
      );

      return duration;
    };

    // Simple case: 3 depositors, equal stake. No liquidations. No front-end.
    it("withdrawFromSP(): Depositors with equal initial deposit withdraw correct ZKT gain. No liquidations. No front end.", async () => {
      const initialIssuance = await communityIssuanceTester.totalZKTIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k NEON
      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        whale,
        whale,
        { from: whale, value: dec(10000, "ether") }
      );

      await borrowerOperations.openTrove(th._100pct, dec(1, 22), A, A, {
        from: A,
        value: dec(100, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(1, 22), B, B, {
        from: B,
        value: dec(100, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(1, 22), C, C, {
        from: C,
        value: dec(100, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(1, 22), D, D, {
        from: D,
        value: dec(100, "ether"),
      });

      // Check all ZKT balances are initially 0
      assert.equal(await zkToken.balanceOf(A), 0);
      assert.equal(await zkToken.balanceOf(B), 0);
      assert.equal(await zkToken.balanceOf(C), 0);

      // A, B, C deposit
      await stabilityPool.provideToSP(dec(1, 22), { from: A });
      await stabilityPool.provideToSP(dec(1, 22), { from: B });
      await stabilityPool.provideToSP(dec(1, 22), { from: C });

      // One year passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_YEAR),
        web3.currentProvider
      );

      // D deposits, triggering ZKT gains for A,B,C. Withdraws immediately after
      await stabilityPool.provideToSP(dec(1, 18), { from: D });
      await stabilityPool.withdrawFromSP(dec(1, 18), { from: D });

      // Expected gains for each depositor after 1 year (50% total issued).  Each deposit gets 1/3 of issuance.
      const expectedZKTGain_1yr = communityZKTSupply
        .div(toBN("2"))
        .div(toBN("3"));

      // Check ZKT gain
      const A_ZKTGain_1yr = await stabilityPool.getDepositorZKTGain(A);
      const B_ZKTGain_1yr = await stabilityPool.getDepositorZKTGain(B);
      const C_ZKTGain_1yr = await stabilityPool.getDepositorZKTGain(C);

      // console.log(`A_ZKTGain_1yr: ${A_ZKTGain_1yr}`);
      // console.log(`B_ZKTGain_1yr: ${B_ZKTGain_1yr}`);
      // console.log(`C_ZKTGain_1yr: ${C_ZKTGain_1yr}`);
      // console.log(`expectedZKTGain_1yr: ${expectedZKTGain_1yr}`);

      // Check gains are correct, error tolerance = 1e-6 of a token

      assert.isAtMost(getDifference(A_ZKTGain_1yr, expectedZKTGain_1yr), 1e12);
      assert.isAtMost(getDifference(B_ZKTGain_1yr, expectedZKTGain_1yr), 1e12);
      assert.isAtMost(getDifference(C_ZKTGain_1yr, expectedZKTGain_1yr), 1e12);

      // Another year passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // D deposits, triggering ZKT gains for A,B,C. Withdraws immediately after
      await stabilityPool.provideToSP(dec(1, 18), { from: D });
      await stabilityPool.withdrawFromSP(dec(1, 18), { from: D });

      // Expected gains for each depositor after 2 years (75% total issued).  Each deposit gets 1/3 of issuance.
      const expectedZKTGain_2yr = communityZKTSupply
        .mul(toBN("3"))
        .div(toBN("4"))
        .div(toBN("3"));

      // Check ZKT gain
      const A_ZKTGain_2yr = await stabilityPool.getDepositorZKTGain(A);
      const B_ZKTGain_2yr = await stabilityPool.getDepositorZKTGain(B);
      const C_ZKTGain_2yr = await stabilityPool.getDepositorZKTGain(C);

      // Check gains are correct, error tolerance = 1e-6 of a token
      assert.isAtMost(getDifference(A_ZKTGain_2yr, expectedZKTGain_2yr), 1e12);
      assert.isAtMost(getDifference(B_ZKTGain_2yr, expectedZKTGain_2yr), 1e12);
      assert.isAtMost(getDifference(C_ZKTGain_2yr, expectedZKTGain_2yr), 1e12);

      // Each depositor fully withdraws
      await stabilityPool.withdrawFromSP(dec(100, 18), { from: A });
      await stabilityPool.withdrawFromSP(dec(100, 18), { from: B });
      await stabilityPool.withdrawFromSP(dec(100, 18), { from: C });

      // Check ZKT balances increase by correct amount
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(A), expectedZKTGain_2yr),
        1e12
      );
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(B), expectedZKTGain_2yr),
        1e12
      );
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(C), expectedZKTGain_2yr),
        1e12
      );
    });

    // 3 depositors, varied stake. No liquidations. No front-end.
    it("withdrawFromSP(): Depositors with varying initial deposit withdraw correct ZKT gain. No liquidations. No front end.", async () => {
      const initialIssuance = await communityIssuanceTester.totalZKTIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k NEON
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(10000, 18)),
        whale,
        whale,
        { from: whale, value: dec(10000, "ether") }
      );

      await borrowerOperations.openTrove(th._100pct, dec(10000, 18), A, A, {
        from: A,
        value: dec(200, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(20000, 18), B, B, {
        from: B,
        value: dec(300, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(30000, 18), C, C, {
        from: C,
        value: dec(400, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(10000, 18), D, D, {
        from: D,
        value: dec(100, "ether"),
      });

      // Check all ZKT balances are initially 0
      assert.equal(await zkToken.balanceOf(A), 0);
      assert.equal(await zkToken.balanceOf(B), 0);
      assert.equal(await zkToken.balanceOf(C), 0);

      // A, B, C deposit
      await stabilityPool.provideToSP(dec(10000, 18), {
        from: A,
      });
      await stabilityPool.provideToSP(dec(20000, 18), {
        from: B,
      });
      await stabilityPool.provideToSP(dec(30000, 18), {
        from: C,
      });

      // One year passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_YEAR),
        web3.currentProvider
      );

      // D deposits, triggering ZKT gains for A,B,C. Withdraws immediately after
      await stabilityPool.provideToSP(dec(1, 18), { from: D });
      await stabilityPool.withdrawFromSP(dec(1, 18), { from: D });

      // Expected gains for each depositor after 1 year (50% total issued)
      const A_expectedZKTGain_1yr = communityZKTSupply
        .div(toBN("2")) // 50% of total issued after 1 year
        .div(toBN("6")); // A gets 1/6 of the issuance

      const B_expectedZKTGain_1yr = communityZKTSupply
        .div(toBN("2")) // 50% of total issued after 1 year
        .div(toBN("3")); // B gets 2/6 = 1/3 of the issuance

      const C_expectedZKTGain_1yr = communityZKTSupply
        .div(toBN("2")) // 50% of total issued after 1 year
        .div(toBN("2")); // C gets 3/6 = 1/2 of the issuance

      // Check ZKT gain
      const A_ZKTGain_1yr = await stabilityPool.getDepositorZKTGain(A);
      const B_ZKTGain_1yr = await stabilityPool.getDepositorZKTGain(B);
      const C_ZKTGain_1yr = await stabilityPool.getDepositorZKTGain(C);

      // Check gains are correct, error tolerance = 1e-6 of a toke
      assert.isAtMost(
        getDifference(A_ZKTGain_1yr, A_expectedZKTGain_1yr),
        1e12
      );
      assert.isAtMost(
        getDifference(B_ZKTGain_1yr, B_expectedZKTGain_1yr),
        1e12
      );
      assert.isAtMost(
        getDifference(C_ZKTGain_1yr, C_expectedZKTGain_1yr),
        1e12
      );

      // Another year passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // D deposits, triggering ZKT gains for A,B,C. Withdraws immediately after
      await stabilityPool.provideToSP(dec(1, 18), { from: D });
      await stabilityPool.withdrawFromSP(dec(1, 18), { from: D });

      // Expected gains for each depositor after 2 years (75% total issued).
      const A_expectedZKTGain_2yr = communityZKTSupply
        .mul(toBN("3"))
        .div(toBN("4")) // 75% of total issued after 1 year
        .div(toBN("6")); // A gets 1/6 of the issuance

      const B_expectedZKTGain_2yr = communityZKTSupply
        .mul(toBN("3"))
        .div(toBN("4")) // 75% of total issued after 1 year
        .div(toBN("3")); // B gets 2/6 = 1/3 of the issuance

      const C_expectedZKTGain_2yr = communityZKTSupply
        .mul(toBN("3"))
        .div(toBN("4")) // 75% of total issued after 1 year
        .div(toBN("2")); // C gets 3/6 = 1/2 of the issuance

      // Check ZKT gain
      const A_ZKTGain_2yr = await stabilityPool.getDepositorZKTGain(A);
      const B_ZKTGain_2yr = await stabilityPool.getDepositorZKTGain(B);
      const C_ZKTGain_2yr = await stabilityPool.getDepositorZKTGain(C);

      // Check gains are correct, error tolerance = 1e-6 of a token
      assert.isAtMost(
        getDifference(A_ZKTGain_2yr, A_expectedZKTGain_2yr),
        1e12
      );
      assert.isAtMost(
        getDifference(B_ZKTGain_2yr, B_expectedZKTGain_2yr),
        1e12
      );
      assert.isAtMost(
        getDifference(C_ZKTGain_2yr, C_expectedZKTGain_2yr),
        1e12
      );

      // Each depositor fully withdraws
      await stabilityPool.withdrawFromSP(dec(10000, 18), { from: A });
      await stabilityPool.withdrawFromSP(dec(10000, 18), { from: B });
      await stabilityPool.withdrawFromSP(dec(10000, 18), { from: C });

      // Check ZKT balances increase by correct amount
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(A), A_expectedZKTGain_2yr),
        1e12
      );
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(B), B_expectedZKTGain_2yr),
        1e12
      );
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(C), C_expectedZKTGain_2yr),
        1e12
      );
    });

    // A, B, C deposit. Varied stake. 1 Liquidation. D joins.
    it("withdrawFromSP(): Depositors with varying initial deposit withdraw correct ZKT gain. No liquidations. No front end.", async () => {
      const initialIssuance = await communityIssuanceTester.totalZKTIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k NEON
      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        whale,
        whale,
        { from: whale, value: dec(10000, "ether") }
      );

      await borrowerOperations.openTrove(th._100pct, dec(10000, 18), A, A, {
        from: A,
        value: dec(200, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(20000, 18), B, B, {
        from: B,
        value: dec(300, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(30000, 18), C, C, {
        from: C,
        value: dec(400, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(40000, 18), D, D, {
        from: D,
        value: dec(500, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(40000, 18), E, E, {
        from: E,
        value: dec(600, "ether"),
      });

      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(30000, 18)),
        defaulter_1,
        defaulter_1,
        { from: defaulter_1, value: dec(300, "ether") }
      );

      // Check all ZKT balances are initially 0
      assert.equal(await zkToken.balanceOf(A), 0);
      assert.equal(await zkToken.balanceOf(B), 0);
      assert.equal(await zkToken.balanceOf(C), 0);
      assert.equal(await zkToken.balanceOf(D), 0);

      // A, B, C deposit
      await stabilityPool.provideToSP(dec(10000, 18), {
        from: A,
      });
      await stabilityPool.provideToSP(dec(20000, 18), {
        from: B,
      });
      await stabilityPool.provideToSP(dec(30000, 18), {
        from: C,
      });

      // Year 1 passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_YEAR),
        web3.currentProvider
      );

      assert.equal(await stabilityPool.getTotalZKUSDDeposits(), dec(60000, 18));

      // Price Drops, defaulter1 liquidated. Stability Pool size drops by 50%
      await priceFeed.setPrice(dec(100, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1);
      assert.isFalse(await sortedTroves.contains(defaulter_1));

      // Confirm SP dropped from 60k to 30k
      assert.isAtMost(
        getDifference(
          await stabilityPool.getTotalZKUSDDeposits(),
          dec(30000, 18)
        ),
        1000
      );

      // Expected gains for each depositor after 1 year (50% total issued)
      const A_expectedZKTGain_Y1 = communityZKTSupply
        .div(toBN("2")) // 50% of total issued in Y1
        .div(toBN("6")); // A got 1/6 of the issuance

      const B_expectedZKTGain_Y1 = communityZKTSupply
        .div(toBN("2")) // 50% of total issued in Y1
        .div(toBN("3")); // B gets 2/6 = 1/3 of the issuance

      const C_expectedZKTGain_Y1 = communityZKTSupply
        .div(toBN("2")) // 50% of total issued in Y1
        .div(toBN("2")); // C gets 3/6 = 1/2 of the issuance

      // Check ZKT gain
      const A_ZKTGain_Y1 = await stabilityPool.getDepositorZKTGain(A);
      const B_ZKTGain_Y1 = await stabilityPool.getDepositorZKTGain(B);
      const C_ZKTGain_Y1 = await stabilityPool.getDepositorZKTGain(C);

      // Check gains are correct, error tolerance = 1e-6 of a toke
      assert.isAtMost(getDifference(A_ZKTGain_Y1, A_expectedZKTGain_Y1), 1e12);
      assert.isAtMost(getDifference(B_ZKTGain_Y1, B_expectedZKTGain_Y1), 1e12);
      assert.isAtMost(getDifference(C_ZKTGain_Y1, C_expectedZKTGain_Y1), 1e12);

      // D deposits 40k
      await stabilityPool.provideToSP(dec(40000, 18), {
        from: D,
      });

      // Year 2 passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // E deposits and withdraws, creating ZKT issuance
      await stabilityPool.provideToSP(dec(1, 18), { from: E });
      await stabilityPool.withdrawFromSP(dec(1, 18), { from: E });

      // Expected gains for each depositor during Y2:
      const A_expectedZKTGain_Y2 = communityZKTSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .div(toBN("14")); // A got 50/700 = 1/14 of the issuance

      const B_expectedZKTGain_Y2 = communityZKTSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .div(toBN("7")); // B got 100/700 = 1/7 of the issuance

      const C_expectedZKTGain_Y2 = communityZKTSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .mul(toBN("3"))
        .div(toBN("14")); // C gets 150/700 = 3/14 of the issuance

      const D_expectedZKTGain_Y2 = communityZKTSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .mul(toBN("4"))
        .div(toBN("7")); // D gets 400/700 = 4/7 of the issuance

      // Check ZKT gain
      const A_ZKTGain_AfterY2 = await stabilityPool.getDepositorZKTGain(A);
      const B_ZKTGain_AfterY2 = await stabilityPool.getDepositorZKTGain(B);
      const C_ZKTGain_AfterY2 = await stabilityPool.getDepositorZKTGain(C);
      const D_ZKTGain_AfterY2 = await stabilityPool.getDepositorZKTGain(D);

      const A_expectedTotalGain =
        A_expectedZKTGain_Y1.add(A_expectedZKTGain_Y2);
      const B_expectedTotalGain =
        B_expectedZKTGain_Y1.add(B_expectedZKTGain_Y2);
      const C_expectedTotalGain =
        C_expectedZKTGain_Y1.add(C_expectedZKTGain_Y2);
      const D_expectedTotalGain = D_expectedZKTGain_Y2;

      // Check gains are correct, error tolerance = 1e-6 of a token
      assert.isAtMost(
        getDifference(A_ZKTGain_AfterY2, A_expectedTotalGain),
        1e12
      );
      assert.isAtMost(
        getDifference(B_ZKTGain_AfterY2, B_expectedTotalGain),
        1e12
      );
      assert.isAtMost(
        getDifference(C_ZKTGain_AfterY2, C_expectedTotalGain),
        1e12
      );
      assert.isAtMost(
        getDifference(D_ZKTGain_AfterY2, D_expectedTotalGain),
        1e12
      );

      // Each depositor fully withdraws
      await stabilityPool.withdrawFromSP(dec(10000, 18), { from: A });
      await stabilityPool.withdrawFromSP(dec(20000, 18), { from: B });
      await stabilityPool.withdrawFromSP(dec(30000, 18), { from: C });
      await stabilityPool.withdrawFromSP(dec(40000, 18), { from: D });

      // Check ZKT balances increase by correct amount
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(A), A_expectedTotalGain),
        1e12
      );
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(B), B_expectedTotalGain),
        1e12
      );
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(C), C_expectedTotalGain),
        1e12
      );
      assert.isAtMost(
        getDifference(await zkToken.balanceOf(D), D_expectedTotalGain),
        1e12
      );
    });

    //--- Serial pool-emptying liquidations ---

    /* A, B deposit 100C
        L1 cancels 200C
        B, C deposits 100C
        L2 cancels 200C
        E, F deposit 100C
        L3 cancels 200C
        G,H deposits 100C
        L4 cancels 200C

        Expect all depositors withdraw  1/2 of 1 month's ZKT issuance */
    it("withdrawFromSP(): Depositor withdraws correct ZKT gain after serial pool-emptying liquidations. No front-ends.", async () => {
      const initialIssuance = await communityIssuanceTester.totalZKTIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k NEON
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(10000, 18)),
        whale,
        whale,
        { from: whale, value: dec(10000, "ether") }
      );

      const allDepositors = [A, B, C, D, E, F, G, H];
      // 4 Defaulters open trove with 200ZKUSD debt, and 200% ICR
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(20000, 18)),
        defaulter_1,
        defaulter_1,
        { from: defaulter_1, value: dec(200, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(20000, 18)),
        defaulter_2,
        defaulter_2,
        { from: defaulter_2, value: dec(200, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(20000, 18)),
        defaulter_3,
        defaulter_3,
        { from: defaulter_3, value: dec(200, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(20000, 18)),
        defaulter_4,
        defaulter_4,
        { from: defaulter_4, value: dec(200, "ether") }
      );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Check all would-be depositors have 0 ZKT balance
      for (depositor of allDepositors) {
        assert.equal(await zkToken.balanceOf(depositor), "0");
      }

      // A, B each deposit 10k ZKUSD
      const depositors_1 = [A, B];
      for (account of depositors_1) {
        await borrowerOperations.openTrove(
          th._100pct,
          dec(10000, 18),
          account,
          account,
          { from: account, value: dec(200, "ether") }
        );
        await stabilityPool.provideToSP(dec(10000, 18), {
          from: account,
        });
      }

      // 1 month passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider
      );

      // Defaulter 1 liquidated. 20k ZKUSD fully offset with pool.
      await troveManager.liquidate(defaulter_1, { from: owner });

      // C, D each deposit 10k ZKUSD
      const depositors_2 = [C, D];
      for (account of depositors_2) {
        await borrowerOperations.openTrove(
          th._100pct,
          dec(10000, 18),
          account,
          account,
          { from: account, value: dec(200, "ether") }
        );
        await stabilityPool.provideToSP(dec(10000, 18), {
          from: account,
        });
      }

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // Defaulter 2 liquidated. 10k ZKUSD offset
      await troveManager.liquidate(defaulter_2, { from: owner });

      // Erin, Flyn each deposit 100 ZKUSD
      const depositors_3 = [E, F];
      for (account of depositors_3) {
        await borrowerOperations.openTrove(
          th._100pct,
          dec(10000, 18),
          account,
          account,
          { from: account, value: dec(200, "ether") }
        );
        await stabilityPool.provideToSP(dec(10000, 18), {
          from: account,
        });
      }

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // Defaulter 3 liquidated. 100 ZKUSD offset
      await troveManager.liquidate(defaulter_3, { from: owner });

      // Graham, Harriet each deposit 10k ZKUSD
      const depositors_4 = [G, H];
      for (account of depositors_4) {
        await borrowerOperations.openTrove(
          th._100pct,
          dec(10000, 18),
          account,
          account,
          { from: account, value: dec(200, "ether") }
        );
        await stabilityPool.provideToSP(dec(10000, 18), {
          from: account,
        });
      }

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // Defaulter 4 liquidated. 100 ZKUSD offset
      await troveManager.liquidate(defaulter_4, { from: owner });

      // All depositors withdraw from SP
      for (depositor of allDepositors) {
        await stabilityPool.withdrawFromSP(dec(10000, 18), { from: depositor });
      }

      /* Each depositor constitutes 50% of the pool from the time they deposit, up until the liquidation.
            Therefore, divide monthly issuance by 2 to get the expected per-depositor ZKT gain.*/
      const expectedZKTGain_M1 = issuance_M1.div(th.toBN("2"));
      const expectedZKTGain_M2 = issuance_M2.div(th.toBN("2"));
      const expectedZKTGain_M3 = issuance_M3.div(th.toBN("2"));
      const expectedZKTGain_M4 = issuance_M4.div(th.toBN("2"));

      // Check A, B only earn issuance from month 1. Error tolerance = 1e-3 tokens
      for (depositor of [A, B]) {
        const ZKTBalance = await zkToken.balanceOf(depositor);
        assert.isAtMost(getDifference(ZKTBalance, expectedZKTGain_M1), 1e15);
      }

      // Check C, D only earn issuance from month 2.  Error tolerance = 1e-3 tokens
      for (depositor of [C, D]) {
        const ZKTBalance = await zkToken.balanceOf(depositor);
        assert.isAtMost(getDifference(ZKTBalance, expectedZKTGain_M2), 1e15);
      }

      // Check E, F only earn issuance from month 3.  Error tolerance = 1e-3 tokens
      for (depositor of [E, F]) {
        const ZKTBalance = await zkToken.balanceOf(depositor);
        assert.isAtMost(getDifference(ZKTBalance, expectedZKTGain_M3), 1e15);
      }

      // Check G, H only earn issuance from month 4.  Error tolerance = 1e-3 tokens
      for (depositor of [G, H]) {
        const ZKTBalance = await zkToken.balanceOf(depositor);
        assert.isAtMost(getDifference(ZKTBalance, expectedZKTGain_M4), 1e15);
      }

      const finalEpoch = (await stabilityPool.currentEpoch()).toString();
      assert.equal(finalEpoch, 4);
    });

    it("ZKT issuance for a given period is not obtainable if the SP was empty during the period", async () => {
      const CIBalanceBefore = await zkToken.balanceOf(
        communityIssuanceTester.address
      );

      await borrowerOperations.openTrove(th._100pct, dec(16000, 18), A, A, {
        from: A,
        value: dec(200, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(10000, 18), B, B, {
        from: B,
        value: dec(100, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(16000, 18), C, C, {
        from: C,
        value: dec(200, "ether"),
      });

      const totalZKTissuance_0 = await communityIssuanceTester.totalZKTIssued();
      const G_0 = await stabilityPool.epochToScaleToG(0, 0); // epochs and scales will not change in this test: no liquidations
      assert.equal(totalZKTissuance_0, "0");
      assert.equal(G_0, "0");

      // 1 month passes (M1)
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider
      );

      // ZKT issuance event triggered: A deposits
      await stabilityPool.provideToSP(dec(10000, 18), {
        from: A,
      });

      // Check G is not updated, since SP was empty prior to A's deposit
      const G_1 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_1.eq(G_0));

      // Check total ZKT issued is updated
      const totalZKTissuance_1 = await communityIssuanceTester.totalZKTIssued();
      assert.isTrue(totalZKTissuance_1.gt(totalZKTissuance_0));

      // 1 month passes (M2)
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      //ZKT issuance event triggered: A withdraws.
      await stabilityPool.withdrawFromSP(dec(10000, 18), { from: A });

      // Check G is updated, since SP was not empty prior to A's withdrawal
      const G_2 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_2.gt(G_1));

      // Check total ZKT issued is updated
      const totalZKTissuance_2 = await communityIssuanceTester.totalZKTIssued();
      assert.isTrue(totalZKTissuance_2.gt(totalZKTissuance_1));

      // 1 month passes (M3)
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // ZKT issuance event triggered: C deposits
      await stabilityPool.provideToSP(dec(10000, 18), {
        from: C,
      });

      // Check G is not updated, since SP was empty prior to C's deposit
      const G_3 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_3.eq(G_2));

      // Check total ZKT issued is updated
      const totalZKTissuance_3 = await communityIssuanceTester.totalZKTIssued();
      assert.isTrue(totalZKTissuance_3.gt(totalZKTissuance_2));

      // 1 month passes (M4)
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // C withdraws
      await stabilityPool.withdrawFromSP(dec(10000, 18), { from: C });

      // Check G is increased, since SP was not empty prior to C's withdrawal
      const G_4 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_4.gt(G_3));

      // Check total ZKT issued is increased
      const totalZKTissuance_4 = await communityIssuanceTester.totalZKTIssued();
      assert.isTrue(totalZKTissuance_4.gt(totalZKTissuance_3));

      // Get ZKT Gains
      const A_ZKTGain = await zkToken.balanceOf(A);
      const C_ZKTGain = await zkToken.balanceOf(C);

      // Check A earns gains from M2 only
      assert.isAtMost(getDifference(A_ZKTGain, issuance_M2), 1e15);

      // Check C earns gains from M4 only
      assert.isAtMost(getDifference(C_ZKTGain, issuance_M4), 1e15);

      // Check totalZKTIssued = M1 + M2 + M3 + M4.  1e-3 error tolerance.
      const expectedIssuance4Months = issuance_M1
        .add(issuance_M2)
        .add(issuance_M3)
        .add(issuance_M4);
      assert.isAtMost(
        getDifference(expectedIssuance4Months, totalZKTissuance_4),
        1e15
      );

      // Check CI has only transferred out tokens for M2 + M4.  1e-3 error tolerance.
      const expectedZKTSentOutFromCI = issuance_M2.add(issuance_M4);
      const CIBalanceAfter = await zkToken.balanceOf(
        communityIssuanceTester.address
      );
      const CIBalanceDifference = CIBalanceBefore.sub(CIBalanceAfter);
      assert.isAtMost(
        getDifference(CIBalanceDifference, expectedZKTSentOutFromCI),
        1e15
      );
    });

    // --- Scale factor changes ---

    /* Serial scale changes

        A make deposit 10k ZKUSD
        1 month passes. L1 decreases P: P = 1e-5 P. L1:   9999.9 ZKUSD, 100 NEON
        B makes deposit 9999.9
        1 month passes. L2 decreases P: P =  1e-5 P. L2:  9999.9 ZKUSD, 100 NEON
        C makes deposit  9999.9
        1 month passes. L3 decreases P: P = 1e-5 P. L3:  9999.9 ZKUSD, 100 NEON
        D makes deposit  9999.9
        1 month passes. L4 decreases P: P = 1e-5 P. L4:  9999.9 ZKUSD, 100 NEON
        E makes deposit  9999.9
        1 month passes. L5 decreases P: P = 1e-5 P. L5:  9999.9 ZKUSD, 100 NEON
        =========
        F makes deposit 100
        1 month passes. L6 empties the Pool. L6:  10000 ZKUSD, 100 NEON

        expect A, B, C, D each withdraw ~1 month's worth of ZKT */
    it("withdrawFromSP(): Several deposits of 100 ZKUSD span one scale factor change. Depositors withdraw correct ZKT gains", async () => {
      // Whale opens Trove with 100 NEON
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(10000, 18)),
        whale,
        whale,
        { from: whale, value: dec(100, "ether") }
      );

      const fiveDefaulters = [
        defaulter_1,
        defaulter_2,
        defaulter_3,
        defaulter_4,
        defaulter_5,
      ];

      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: A, value: dec(10000, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: B, value: dec(10000, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: C, value: dec(10000, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: D, value: dec(10000, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: E, value: dec(10000, "ether") }
      );
      await borrowerOperations.openTrove(
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: F, value: dec(10000, "ether") }
      );

      for (const defaulter of fiveDefaulters) {
        // Defaulters 1-5 each withdraw to 9999.9 debt (including gas comp)
        await borrowerOperations.openTrove(
          th._100pct,
          await getOpenTroveZKUSDAmount("9999900000000000000000"),
          defaulter,
          defaulter,
          { from: defaulter, value: dec(100, "ether") }
        );
      }

      // Defaulter 6 withdraws to 10k debt (inc. gas comp)
      await borrowerOperations.openTrove(
        th._100pct,
        await getOpenTroveZKUSDAmount(dec(10000, 18)),
        defaulter_6,
        defaulter_6,
        { from: defaulter_6, value: dec(100, "ether") }
      );

      // Confirm all depositors have 0 ZKT
      for (const depositor of [A, B, C, D, E, F]) {
        assert.equal(await zkToken.balanceOf(depositor), "0");
      }
      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Check scale is 0
      // assert.equal(await stabilityPool.currentScale(), '0')

      // A provides to SP
      await stabilityPool.provideToSP(dec(10000, 18), {
        from: A,
      });

      // 1 month passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider
      );

      // Defaulter 1 liquidated.  Value of P updated to  to 1e-5
      const txL1 = await troveManager.liquidate(defaulter_1, { from: owner });
      assert.isFalse(await sortedTroves.contains(defaulter_1));
      assert.isTrue(txL1.receipt.status);

      // Check scale is 0
      assert.equal(await stabilityPool.currentScale(), "0");
      assert.equal(await stabilityPool.P(), dec(1, 13)); //P decreases: P = 1e(18-5) = 1e13

      // B provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), {
        from: B,
      });

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // Defaulter 2 liquidated
      const txL2 = await troveManager.liquidate(defaulter_2, { from: owner });
      assert.isFalse(await sortedTroves.contains(defaulter_2));
      assert.isTrue(txL2.receipt.status);

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), "1");
      assert.equal(await stabilityPool.P(), dec(1, 17)); //Scale changes and P changes: P = 1e(13-5+9) = 1e17

      // C provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), {
        from: C,
      });

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // Defaulter 3 liquidated
      const txL3 = await troveManager.liquidate(defaulter_3, { from: owner });
      assert.isFalse(await sortedTroves.contains(defaulter_3));
      assert.isTrue(txL3.receipt.status);

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), "1");
      assert.equal(await stabilityPool.P(), dec(1, 12)); //P decreases: P 1e(17-5) = 1e12

      // D provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), {
        from: D,
      });

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // Defaulter 4 liquidated
      const txL4 = await troveManager.liquidate(defaulter_4, { from: owner });
      assert.isFalse(await sortedTroves.contains(defaulter_4));
      assert.isTrue(txL4.receipt.status);

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), "2");
      assert.equal(await stabilityPool.P(), dec(1, 16)); //Scale changes and P changes:: P = 1e(12-5+9) = 1e16

      // E provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), {
        from: E,
      });

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      // Defaulter 5 liquidated
      const txL5 = await troveManager.liquidate(defaulter_5, { from: owner });
      assert.isFalse(await sortedTroves.contains(defaulter_5));
      assert.isTrue(txL5.receipt.status);

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), "2");
      assert.equal(await stabilityPool.P(), dec(1, 11)); // P decreases: P = 1e(16-5) = 1e11

      // F provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), {
        from: F,
      });

      // 1 month passes
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_MONTH,
        web3.currentProvider
      );

      assert.equal(await stabilityPool.currentEpoch(), "0");

      // Defaulter 6 liquidated
      const txL6 = await troveManager.liquidate(defaulter_6, { from: owner });
      assert.isFalse(await sortedTroves.contains(defaulter_6));
      assert.isTrue(txL6.receipt.status);

      // Check scale is 0, epoch is 1
      assert.equal(await stabilityPool.currentScale(), "0");
      assert.equal(await stabilityPool.currentEpoch(), "1");
      assert.equal(await stabilityPool.P(), dec(1, 18)); // P resets to 1e18 after pool-emptying

      // price doubles
      await priceFeed.setPrice(dec(200, 18));

      /* All depositors withdraw fully from SP.  Withdraw in reverse order, so that the largest remaining
            deposit (F) withdraws first, and does not get extra ZKT gains from the periods between withdrawals */
      for (depositor of [F, E, D, C, B, A]) {
        await stabilityPool.withdrawFromSP(dec(10000, 18), { from: depositor });
      }

      const ZKTGain_A = await zkToken.balanceOf(A);
      const ZKTGain_B = await zkToken.balanceOf(B);
      const ZKTGain_C = await zkToken.balanceOf(C);
      const ZKTGain_D = await zkToken.balanceOf(D);
      const ZKTGain_E = await zkToken.balanceOf(E);
      const ZKTGain_F = await zkToken.balanceOf(F);

      /* Expect each deposit to have earned 100% of the ZKT issuance for the month in which it was active, prior
           to the liquidation that mostly depleted it.  Error tolerance = 1e-3 tokens. */

      const expectedGainA = issuance_M1.add(issuance_M2.div(toBN("100000")));
      const expectedGainB = issuance_M2
        .add(issuance_M3.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainC = issuance_M3
        .add(issuance_M4.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainD = issuance_M4
        .add(issuance_M5.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainE = issuance_M5
        .add(issuance_M6.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainF = issuance_M6.mul(toBN("99999")).div(toBN("100000"));

      assert.isAtMost(getDifference(expectedGainA, ZKTGain_A), 1e15);
      assert.isAtMost(getDifference(expectedGainB, ZKTGain_B), 1e15);
      assert.isAtMost(getDifference(expectedGainC, ZKTGain_C), 1e15);
      assert.isAtMost(getDifference(expectedGainD, ZKTGain_D), 1e15);

      assert.isAtMost(getDifference(expectedGainE, ZKTGain_E), 1e15);
      assert.isAtMost(getDifference(expectedGainF, ZKTGain_F), 1e15);
    });
  });
});

contract("Reset chain state", async (accounts) => {});
