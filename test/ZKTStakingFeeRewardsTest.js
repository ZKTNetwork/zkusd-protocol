const Decimal = require("decimal.js");
const deploymentHelper = require("../utils/deploymentHelpers.js");
const { BNConverter } = require("../utils/BNConverter.js");
const testHelpers = require("../utils/testHelpers.js");

const ZKTStakingTester = artifacts.require("ZKTStakingTester");
const TroveManagerTester = artifacts.require("TroveManagerTester");
const NonPayable = artifacts.require("./NonPayable.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;
const assertRevert = th.assertRevert;

const toBN = th.toBN;
const ZERO = th.toBN("0");

const GAS_PRICE = 10000000;

/* NOTE: These tests do not test for specific NEON and ZKUSD gain values. They only test that the
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake.
 *
 * Specific NEON/ZKUSD gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 *
 */

contract("ZKTStaking revenue share tests", async (accounts) => {
  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  const [owner, A, B, C, D, E, F, G, whale] = accounts;

  let priceFeed;
  let zkusdToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;
  let zktStaking;
  let zkToken;

  let contracts;

  const openTrove = async (params) => th.openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployLiquityCore();
    contracts.troveManager = await TroveManagerTester.new();
    contracts = await deploymentHelper.deployZKUSDTokenTester(contracts);
    const ZKTContracts = await deploymentHelper.deployZKTTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );

    await deploymentHelper.connectZKTContracts(ZKTContracts);
    await deploymentHelper.connectCoreContracts(contracts, ZKTContracts);
    await deploymentHelper.connectZKTContractsToCore(ZKTContracts, contracts);

    nonPayable = await NonPayable.new();
    priceFeed = contracts.priceFeedTestnet;
    zkusdToken = contracts.zkusdToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    activePool = contracts.activePool;
    stabilityPool = contracts.stabilityPool;
    defaultPool = contracts.defaultPool;
    borrowerOperations = contracts.borrowerOperations;
    hintHelpers = contracts.hintHelpers;

    zkToken = ZKTContracts.zkToken;
    zktStaking = ZKTContracts.zktStaking;
  });

  it("stake(): reverts if amount is zero", async () => {
    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), { from: multisig });

    // console.log(`A zkt bal: ${await zkToken.balanceOf(A)}`)

    // A makes stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await assertRevert(
      zktStaking.stake(0, { from: A }),
      "ZKTStaking: Amount must be non-zero"
    );
  });

  it("NEON fee per ZKT staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), {
      from: multisig,
      gasPrice: GAS_PRICE,
    });

    // console.log(`A zkt bal: ${await zkToken.balanceOf(A)}`)

    // A makes stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await zktStaking.stake(dec(100, 18), { from: A });

    // Check NEON fee per unit staked is zero
    const F_NEON_Before = await zktStaking.F_NEON();
    assert.equal(F_NEON_Before, "0");

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check NEON fee emitted in event is non-zero
    const emittedNEONFee = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx))[3]
    );
    assert.isTrue(emittedNEONFee.gt(toBN("0")));

    // Check NEON fee per unit staked has increased by correct amount
    const F_NEON_After = await zktStaking.F_NEON();

    // Expect fee per unit staked = fee/100, since there is 100 ZKUSD totalStaked
    const expected_F_NEON_After = emittedNEONFee.div(toBN("100"));

    assert.isTrue(expected_F_NEON_After.eq(F_NEON_After));
  });

  it("NEON fee per ZKT staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), {
      from: multisig,
      gasPrice: GAS_PRICE,
    });

    // Check NEON fee per unit staked is zero
    const F_NEON_Before = await zktStaking.F_NEON();
    assert.equal(F_NEON_Before, "0");

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check NEON fee emitted in event is non-zero
    const emittedNEONFee = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx))[3]
    );
    assert.isTrue(emittedNEONFee.gt(toBN("0")));

    // Check NEON fee per unit staked has not increased
    const F_NEON_After = await zktStaking.F_NEON();
    assert.equal(F_NEON_After, "0");
  });

  it("ZKUSD fee per ZKT staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await zktStaking.stake(dec(100, 18), { from: A });

    // Check ZKUSD fee per unit staked is zero
    const F_ZKUSD_Before = await zktStaking.F_NEON();
    assert.equal(F_ZKUSD_Before, "0");

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(27, 18),
      D,
      D,
      { from: D }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee = toBN(th.getZKUSDFeeFromZKUSDBorrowingEvent(tx));
    assert.isTrue(emittedZKUSDFee.gt(toBN("0")));

    // Check ZKUSD fee per unit staked has increased by correct amount
    const F_ZKUSD_After = await zktStaking.F_ZKUSD();

    // Expect fee per unit staked = fee/100, since there is 100 ZKUSD totalStaked
    const expected_F_ZKUSD_After = emittedZKUSDFee.div(toBN("100"));

    assert.isTrue(expected_F_ZKUSD_After.eq(F_ZKUSD_After));
  });

  it("ZKUSD fee per ZKT staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), { from: multisig });

    // Check ZKUSD fee per unit staked is zero
    const F_ZKUSD_Before = await zktStaking.F_NEON();
    assert.equal(F_ZKUSD_Before, "0");

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(27, 18),
      D,
      D,
      { from: D }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee = toBN(th.getZKUSDFeeFromZKUSDBorrowingEvent(tx));
    assert.isTrue(emittedZKUSDFee.gt(toBN("0")));

    // Check ZKUSD fee per unit staked did not increase, is still zero
    const F_ZKUSD_After = await zktStaking.F_ZKUSD();
    assert.equal(F_ZKUSD_After, "0");
  });

  it("ZKT Staking: A single staker earns all NEON and ZKT fees that occur", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await zktStaking.stake(dec(100, 18), { from: A });

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check NEON fee 1 emitted in event is non-zero
    const emittedNEONFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedNEONFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await zkusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await zkusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check NEON fee 2 emitted in event is non-zero
    const emittedNEONFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedNEONFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee_1 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedZKUSDFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee_2 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedZKUSDFee_2.gt(toBN("0")));

    const expectedTotalNEONGain = emittedNEONFee_1.add(emittedNEONFee_2);
    const expectedTotalZKUSDGain = emittedZKUSDFee_1.add(emittedZKUSDFee_2);

    const A_NEONBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_ZKUSDBalance_Before = toBN(await zkusdToken.balanceOf(A));

    // A un-stakes
    const GAS_Used = th.gasUsed(
      await zktStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_NEONBalance_After = toBN(await web3.eth.getBalance(A));
    const A_ZKUSDBalance_After = toBN(await zkusdToken.balanceOf(A));

    const A_NEONGain = A_NEONBalance_After.sub(A_NEONBalance_Before).add(
      toBN(GAS_Used * GAS_PRICE)
    );
    const A_ZKUSDGain = A_ZKUSDBalance_After.sub(A_ZKUSDBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalNEONGain, A_NEONGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedTotalZKUSDGain, A_ZKUSDGain),
      1000
    );
  });

  it("stake(): Top-up sends out all accumulated NEON and ZKUSD gains to the staker", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await zktStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check NEON fee 1 emitted in event is non-zero
    const emittedNEONFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedNEONFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await zkusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await zkusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check NEON fee 2 emitted in event is non-zero
    const emittedNEONFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedNEONFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee_1 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedZKUSDFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee_2 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedZKUSDFee_2.gt(toBN("0")));

    const expectedTotalNEONGain = emittedNEONFee_1.add(emittedNEONFee_2);
    const expectedTotalZKUSDGain = emittedZKUSDFee_1.add(emittedZKUSDFee_2);

    const A_NEONBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_ZKUSDBalance_Before = toBN(await zkusdToken.balanceOf(A));

    // A tops up
    const GAS_Used = th.gasUsed(
      await zktStaking.stake(dec(50, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_NEONBalance_After = toBN(await web3.eth.getBalance(A));
    const A_ZKUSDBalance_After = toBN(await zkusdToken.balanceOf(A));

    const A_NEONGain = A_NEONBalance_After.sub(A_NEONBalance_Before).add(
      toBN(GAS_Used * GAS_PRICE)
    );
    const A_ZKUSDGain = A_ZKUSDBalance_After.sub(A_ZKUSDBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalNEONGain, A_NEONGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedTotalZKUSDGain, A_ZKUSDGain),
      1000
    );
  });

  it("getPendingNEONGain(): Returns the staker's correct pending NEON gain", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await zktStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check NEON fee 1 emitted in event is non-zero
    const emittedNEONFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedNEONFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await zkusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await zkusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check NEON fee 2 emitted in event is non-zero
    const emittedNEONFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedNEONFee_2.gt(toBN("0")));

    const expectedTotalNEONGain = emittedNEONFee_1.add(emittedNEONFee_2);

    const A_NEONGain = await zktStaking.getPendingNEONGain(A);

    assert.isAtMost(th.getDifference(expectedTotalNEONGain, A_NEONGain), 1000);
  });

  it("getPendingZKUSDGain(): Returns the staker's correct pending ZKUSD gain", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A
    await zkToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await zktStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await zkusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await zkusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check NEON fee 1 emitted in event is non-zero
    const emittedNEONFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedNEONFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await zkusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await zkusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check NEON fee 2 emitted in event is non-zero
    const emittedNEONFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedNEONFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee_1 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedZKUSDFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    );

    // Check ZKUSD fee value in event is non-zero
    const emittedZKUSDFee_2 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedZKUSDFee_2.gt(toBN("0")));

    const expectedTotalZKUSDGain = emittedZKUSDFee_1.add(emittedZKUSDFee_2);
    const A_ZKUSDGain = await zktStaking.getPendingZKUSDGain(A);

    assert.isAtMost(
      th.getDifference(expectedTotalZKUSDGain, A_ZKUSDGain),
      1000
    );
  });

  // - multi depositors, several rewards
  it("ZKT Staking: Multiple stakers earn the correct share of all NEON and ZKT fees, based on their stake size", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: E },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: F },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: G },
    });

    // FF time one year so owner can transfer ZKT
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A, B, C
    await zkToken.transfer(A, dec(100, 18), { from: multisig });
    await zkToken.transfer(B, dec(200, 18), { from: multisig });
    await zkToken.transfer(C, dec(300, 18), { from: multisig });

    // A, B, C make stake
    await zkToken.approve(zktStaking.address, dec(100, 18), { from: A });
    await zkToken.approve(zktStaking.address, dec(200, 18), { from: B });
    await zkToken.approve(zktStaking.address, dec(300, 18), { from: C });
    await zktStaking.stake(dec(100, 18), { from: A });
    await zktStaking.stake(dec(200, 18), { from: B });
    await zktStaking.stake(dec(300, 18), { from: C });

    // Confirm staking contract holds 600 ZKT
    // console.log(`zkt staking ZKT bal: ${await zkToken.balanceOf(zktStaking.address)}`)
    assert.equal(await zkToken.balanceOf(zktStaking.address), dec(600, 18));
    assert.equal(await zktStaking.totalZKTStaked(), dec(600, 18));

    // F redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      F,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedNEONFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedNEONFee_1.gt(toBN("0")));

    // G redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      G,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedNEONFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedNEONFee_2.gt(toBN("0")));

    // F draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(104, 18),
      F,
      F,
      { from: F }
    );
    const emittedZKUSDFee_1 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedZKUSDFee_1.gt(toBN("0")));

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G }
    );
    const emittedZKUSDFee_2 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedZKUSDFee_2.gt(toBN("0")));

    // D obtains ZKT from owner and makes a stake
    await zkToken.transfer(D, dec(50, 18), { from: multisig });
    await zkToken.approve(zktStaking.address, dec(50, 18), { from: D });
    await zktStaking.stake(dec(50, 18), { from: D });

    // Confirm staking contract holds 650 ZKT
    assert.equal(await zkToken.balanceOf(zktStaking.address), dec(650, 18));
    assert.equal(await zktStaking.totalZKTStaked(), dec(650, 18));

    // G redeems
    const redemptionTx_3 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedNEONFee_3 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_3))[3]
    );
    assert.isTrue(emittedNEONFee_3.gt(toBN("0")));

    // G draws debt
    const borrowingTx_3 = await borrowerOperations.withdrawZKUSD(
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G }
    );
    const emittedZKUSDFee_3 = toBN(
      th.getZKUSDFeeFromZKUSDBorrowingEvent(borrowingTx_3)
    );
    assert.isTrue(emittedZKUSDFee_3.gt(toBN("0")));

    /*  
    Expected rewards:

    A_NEON: (100* NEONFee_1)/600 + (100* NEONFee_2)/600 + (100*NEON_Fee_3)/650
    B_NEON: (200* NEONFee_1)/600 + (200* NEONFee_2)/600 + (200*NEON_Fee_3)/650
    C_NEON: (300* NEONFee_1)/600 + (300* NEONFee_2)/600 + (300*NEON_Fee_3)/650
    D_NEON:                                             (100*NEON_Fee_3)/650

    A_ZKUSD: (100*ZKUSDFee_1 )/600 + (100* ZKUSDFee_2)/600 + (100*ZKUSDFee_3)/650
    B_ZKUSD: (200* ZKUSDFee_1)/600 + (200* ZKUSDFee_2)/600 + (200*ZKUSDFee_3)/650
    C_ZKUSD: (300* ZKUSDFee_1)/600 + (300* ZKUSDFee_2)/600 + (300*ZKUSDFee_3)/650
    D_ZKUSD:                                               (100*ZKUSDFee_3)/650
    */

    // Expected NEON gains
    const expectedNEONGain_A = toBN("100")
      .mul(emittedNEONFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedNEONFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedNEONFee_3).div(toBN("650")));

    const expectedNEONGain_B = toBN("200")
      .mul(emittedNEONFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedNEONFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedNEONFee_3).div(toBN("650")));

    const expectedNEONGain_C = toBN("300")
      .mul(emittedNEONFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedNEONFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedNEONFee_3).div(toBN("650")));

    const expectedNEONGain_D = toBN("50")
      .mul(emittedNEONFee_3)
      .div(toBN("650"));

    // Expected ZKUSD gains:
    const expectedZKUSDGain_A = toBN("100")
      .mul(emittedZKUSDFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedZKUSDFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedZKUSDFee_3).div(toBN("650")));

    const expectedZKUSDGain_B = toBN("200")
      .mul(emittedZKUSDFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedZKUSDFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedZKUSDFee_3).div(toBN("650")));

    const expectedZKUSDGain_C = toBN("300")
      .mul(emittedZKUSDFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedZKUSDFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedZKUSDFee_3).div(toBN("650")));

    const expectedZKUSDGain_D = toBN("50")
      .mul(emittedZKUSDFee_3)
      .div(toBN("650"));

    const A_NEONBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_ZKUSDBalance_Before = toBN(await zkusdToken.balanceOf(A));
    const B_NEONBalance_Before = toBN(await web3.eth.getBalance(B));
    const B_ZKUSDBalance_Before = toBN(await zkusdToken.balanceOf(B));
    const C_NEONBalance_Before = toBN(await web3.eth.getBalance(C));
    const C_ZKUSDBalance_Before = toBN(await zkusdToken.balanceOf(C));
    const D_NEONBalance_Before = toBN(await web3.eth.getBalance(D));
    const D_ZKUSDBalance_Before = toBN(await zkusdToken.balanceOf(D));

    // A-D un-stake
    const A_GAS_Used = th.gasUsed(
      await zktStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );
    const B_GAS_Used = th.gasUsed(
      await zktStaking.unstake(dec(200, 18), { from: B, gasPrice: GAS_PRICE })
    );
    const C_GAS_Used = th.gasUsed(
      await zktStaking.unstake(dec(400, 18), { from: C, gasPrice: GAS_PRICE })
    );
    const D_GAS_Used = th.gasUsed(
      await zktStaking.unstake(dec(50, 18), { from: D, gasPrice: GAS_PRICE })
    );

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal(await zkToken.balanceOf(zktStaking.address), "0");
    assert.equal(await zktStaking.totalZKTStaked(), "0");

    // Get A-D NEON and ZKUSD balances
    const A_NEONBalance_After = toBN(await web3.eth.getBalance(A));
    const A_ZKUSDBalance_After = toBN(await zkusdToken.balanceOf(A));
    const B_NEONBalance_After = toBN(await web3.eth.getBalance(B));
    const B_ZKUSDBalance_After = toBN(await zkusdToken.balanceOf(B));
    const C_NEONBalance_After = toBN(await web3.eth.getBalance(C));
    const C_ZKUSDBalance_After = toBN(await zkusdToken.balanceOf(C));
    const D_NEONBalance_After = toBN(await web3.eth.getBalance(D));
    const D_ZKUSDBalance_After = toBN(await zkusdToken.balanceOf(D));

    // Get NEON and ZKUSD gains
    const A_NEONGain = A_NEONBalance_After.sub(A_NEONBalance_Before).add(
      toBN(A_GAS_Used * GAS_PRICE)
    );
    const A_ZKUSDGain = A_ZKUSDBalance_After.sub(A_ZKUSDBalance_Before);
    const B_NEONGain = B_NEONBalance_After.sub(B_NEONBalance_Before).add(
      toBN(B_GAS_Used * GAS_PRICE)
    );
    const B_ZKUSDGain = B_ZKUSDBalance_After.sub(B_ZKUSDBalance_Before);
    const C_NEONGain = C_NEONBalance_After.sub(C_NEONBalance_Before).add(
      toBN(C_GAS_Used * GAS_PRICE)
    );
    const C_ZKUSDGain = C_ZKUSDBalance_After.sub(C_ZKUSDBalance_Before);
    const D_NEONGain = D_NEONBalance_After.sub(D_NEONBalance_Before).add(
      toBN(D_GAS_Used * GAS_PRICE)
    );
    const D_ZKUSDGain = D_ZKUSDBalance_After.sub(D_ZKUSDBalance_Before);

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedNEONGain_A, A_NEONGain), 1000);
    assert.isAtMost(th.getDifference(expectedZKUSDGain_A, A_ZKUSDGain), 1000);
    assert.isAtMost(th.getDifference(expectedNEONGain_B, B_NEONGain), 1000);
    assert.isAtMost(th.getDifference(expectedZKUSDGain_B, B_ZKUSDGain), 1000);
    assert.isAtMost(th.getDifference(expectedNEONGain_C, C_NEONGain), 1000);
    assert.isAtMost(th.getDifference(expectedZKUSDGain_C, C_ZKUSDGain), 1000);
    assert.isAtMost(th.getDifference(expectedNEONGain_D, D_NEONGain), 1000);
    assert.isAtMost(th.getDifference(expectedZKUSDGain_D, D_ZKUSDGain), 1000);
  });

  it("unstake(): reverts if caller has NEON gains and can't receive NEON", async () => {
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraZKUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers ZKT to staker A and the non-payable proxy
    await zkToken.transfer(A, dec(100, 18), { from: multisig });
    await zkToken.transfer(nonPayable.address, dec(100, 18), {
      from: multisig,
    });

    //  A makes stake
    const A_stakeTx = await zktStaking.stake(dec(100, 18), { from: A });
    assert.isTrue(A_stakeTx.receipt.status);

    //  A tells proxy to make a stake
    const proxystakeTxData = await th.getTransactionData("stake(uint256)", [
      "0x56bc75e2d63100000",
    ]); // proxy stakes 100 ZKT
    await nonPayable.forward(zktStaking.address, proxystakeTxData, { from: A });

    // B makes a redemption, creating NEON gain for proxy
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE)
    );

    const proxy_NEONGain = await zktStaking.getPendingNEONGain(
      nonPayable.address
    );
    assert.isTrue(proxy_NEONGain.gt(toBN("0")));

    // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated NEON gain (albeit 0),
    //  A tells proxy to unstake
    const proxyUnStakeTxData = await th.getTransactionData("unstake(uint256)", [
      "0x56bc75e2d63100000",
    ]); // proxy stakes 100 ZKT
    const proxyUnstakeTxPromise = nonPayable.forward(
      zktStaking.address,
      proxyUnStakeTxData,
      { from: A }
    );

    // but nonPayable proxy can not accept NEON - therefore stake() reverts.
    await assertRevert(proxyUnstakeTxPromise);
  });

  it("receive(): reverts when it receives NEON from an address that is not the Active Pool", async () => {
    const ethSendTxPromise1 = web3.eth.sendTransaction({
      to: zktStaking.address,
      from: A,
      value: dec(1, "ether"),
    });
    const ethSendTxPromise2 = web3.eth.sendTransaction({
      to: zktStaking.address,
      from: owner,
      value: dec(1, "ether"),
    });

    await assertRevert(ethSendTxPromise1);
    await assertRevert(ethSendTxPromise2);
  });

  it("unstake(): reverts if user has no stake", async () => {
    const unstakeTxPromise1 = zktStaking.unstake(1, { from: A });
    const unstakeTxPromise2 = zktStaking.unstake(1, { from: owner });

    await assertRevert(unstakeTxPromise1);
    await assertRevert(unstakeTxPromise2);
  });

  it("Test requireCallerIsTroveManager", async () => {
    const zktStakingTester = await ZKTStakingTester.new();
    await assertRevert(
      zktStakingTester.requireCallerIsTroveManager(),
      "ZKTStaking: caller is not TroveM"
    );
  });
});
