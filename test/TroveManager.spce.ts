import { assert, expect } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import {
  TestHelper as th,
  ContractType,
  TimeValues as timeValues,
  MoneyValues as mv,
  assertTrue,
  assertFalse,
  assertEqual,
  isAtMost,
  address,
} from "./TestHelpers";
import { DeployHelpers, deployFunction } from "./DeployHelpers";
import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  HintHelpers,
  PriceFeedTestnet,
  ZKUSDToken,
  SortedTroves,
  StabilityPool,
} from "../typechain-types";

const dec = th.dec;
const toBN = th.toBN;
const GAS_PRICE = 10000000;
const ZERO_ADDRESS = ethers.constants.AddressZero;

describe("TroveManager", () => {
  let dh = new DeployHelpers();
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  let dennis: Signer;
  let erin: Signer;
  let flyn: Signer;
  let graham: Signer;
  let harriet: Signer;
  let ida: Signer;
  let defaulter_1: Signer;
  let defaulter_2: Signer;
  let defaulter_3: Signer;
  let defaulter_4: Signer;
  let whale: Signer;
  let A: Signer;
  let B: Signer;
  let C: Signer;
  let D: Signer;
  let E: Signer;

  let zkusdToken: ZKUSDToken;
  let activePool: ActivePool;
  let collSurplusPool: CollSurplusPool;
  let defaultPool: DefaultPool;
  let contracts: ContractType;

  const getNetBorrowingAmount = async (debtWithFee: BigNumber) =>
    th.getNetBorrowingAmount(contracts, debtWithFee);
  const openTrove = async (
    account: Signer,
    params: {
      maxFeePercentage?: BigNumber;
      extraZKUSDAmount?: BigNumber;
      upperHint?: string;
      lowerHint?: string;
      ICR?: BigNumber;
      extraParams: any;
    }
  ) => th.openTrove(contracts, account, params);
  const withdrawZKUSD = async (
    account: Signer,
    params: {
      maxFeePercentage?: BigNumber;
      rusdAmount?: BigNumber;
      ICR?: BigNumber;
      upperHint?: string;
      lowerHint?: string;
      extraParams: any;
    }
  ) => th.withdrawZKUSD(contracts, account, params);

  before(async () => {
    await dh.runBeforeInitialize();

    owner = dh.testEnv.users[0];
    alice = dh.testEnv.users[1];
    bob = dh.testEnv.users[2];
    carol = dh.testEnv.users[3];
    dennis = dh.testEnv.users[4];
    erin = dh.testEnv.users[5];
    flyn = dh.testEnv.users[6];
    graham = dh.testEnv.users[7];
    harriet = dh.testEnv.users[8];
    ida = dh.testEnv.users[9];
    defaulter_1 = dh.testEnv.users[10];
    defaulter_2 = dh.testEnv.users[11];
    defaulter_3 = dh.testEnv.users[12];
    defaulter_4 = dh.testEnv.users[13];
    whale = dh.testEnv.users[14];
    A = dh.testEnv.users[15];
    B = dh.testEnv.users[16];
    C = dh.testEnv.users[17];
    D = dh.testEnv.users[18];
    E = dh.testEnv.users[19];
  });
  beforeEach(async () => {
    await dh.runDeployCore();
    contracts = {
      troveManager: dh.testEnv.troveManager,
      stabilityPool: dh.testEnv.stabilityPool,
      borrowerOperations: dh.testEnv.borrowerOperations,
      priceFeedTestnet: dh.testEnv.priceFeed,
      hintHelpers: dh.testEnv.hintHelpers,
      sortedTroves: dh.testEnv.sortedTroves,
    };
    zkusdToken = dh.testEnv.zkusdToken;
    activePool = dh.testEnv.activePool;
    collSurplusPool = dh.testEnv.collSurplusPool;
    defaultPool = dh.testEnv.defaultPool;
  });
  it("liquidate(): closes a Trove that has ICR < MCR", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(whale) },
    });
    await openTrove(alice, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(alice) },
    });

    const price = await contracts.priceFeedTestnet.getPrice();
    const ICR_Before = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );

    expect(ICR_Before).to.be.eq(toBN(dec(4, 18)));

    const MCR = (await contracts.troveManager.MCR()).toString();
    expect(MCR).to.be.eq(BigNumber.from("1100000000000000000"));

    // Alice increases debt to 180 ZKUSD, lowering her ICR to 1.11
    const A_ZKUSDWithdrawal = await getNetBorrowingAmount(toBN(dec(130, 18)));

    const targetICR = toBN("1111111111111111111");
    await withdrawZKUSD(alice, {
      ICR: targetICR,
      extraParams: { from: address(alice) },
    });

    const ICR_AfterWithdrawal = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );
    expect(th.getDifference(ICR_AfterWithdrawal, targetICR)).to.be.lte(100);

    // price drops to 1NEON:100ZKUSD, reducing Alice's ICR below MCR
    await contracts.priceFeedTestnet.setPrice("100000000000000000000");

    // Confirm system is not in Recovery Mode
    expect(await th.checkRecoveryMode(contracts)).to.be.eq(false);

    // close Trove
    await contracts.troveManager.connect(owner).liquidate(address(alice));

    // check the Trove is successfully closed, and removed from sortedList
    const status = (await contracts.troveManager.Troves(address(alice)))[3];
    expect(status).to.be.equal(3); // status enum 3 corresponds to "Closed by liquidation"
    const alice_Trove_isInSortedList = await contracts.sortedTroves.contains(
      address(alice)
    );
    expect(alice_Trove_isInSortedList).to.be.eq(false);
  });

  it("liquidate(): decreases ActivePool NEON and ZKUSDDebt by correct amounts", async () => {
    // --- SETUP ---
    const { collateral: A_collateral, totalDebt: A_totalDebt } =
      await openTrove(alice, {
        ICR: toBN(dec(4, 18)),
        extraParams: { from: address(alice) },
      });
    const { collateral: B_collateral, totalDebt: B_totalDebt } =
      await openTrove(bob, {
        ICR: toBN(dec(21, 17)),
        extraParams: { from: address(bob) },
      });

    // --- TEST ---

    // check ActivePool NEON and ZKUSD debt before
    const activePool_NEON_Before = await activePool.getNEON();
    const activePool_RawConflux_Before = await ethers.provider.getBalance(
      activePool.address
    );
    const activePool_ZKUSDDebt_Before = await activePool.getZKUSDDebt();

    expect(activePool_NEON_Before).to.be.eq(A_collateral.add(B_collateral));
    expect(activePool_RawConflux_Before).to.be.eq(
      A_collateral.add(B_collateral)
    );
    th.assertIsApproximatelyEqual(
      activePool_ZKUSDDebt_Before,
      A_totalDebt.add(B_totalDebt)
    );

    // price drops to 1NEON:100ZKUSD, reducing Bob's ICR below MCR
    await contracts.priceFeedTestnet.setPrice(
      BigNumber.from("100000000000000000000")
    );

    // Confirm system is not in Recovery Mode
    expect(await th.checkRecoveryMode(contracts)).to.be.eq(false);

    /* close Bob's Trove. Should liquidate his ether and ZKUSD,
    leaving Alice’s ether and ZKUSD debt in the ActivePool. */
    await contracts.troveManager.connect(owner).liquidate(address(bob));

    // check ActivePool NEON and ZKUSD debt
    const activePool_NEON_After = await activePool.getNEON();
    const activePool_RawConflux_After = await ethers.provider.getBalance(
      activePool.address
    );
    const activePool_ZKUSDDebt_After = await activePool.getZKUSDDebt();

    expect(activePool_NEON_After).to.be.eq(A_collateral);
    expect(activePool_RawConflux_After).to.be.eq(A_collateral);
    th.assertIsApproximatelyEqual(activePool_ZKUSDDebt_After, A_totalDebt);
  });

  it("liquidate(): increases DefaultPool NEON and ZKUSD debt by correct amounts", async () => {
    // --- SETUP ---
    const { collateral: A_collateral, totalDebt: A_totalDebt } =
      await openTrove(alice, {
        ICR: toBN(dec(4, 18)),
        extraParams: { from: address(alice) },
      });
    const { collateral: B_collateral, totalDebt: B_totalDebt } =
      await openTrove(bob, {
        ICR: toBN(dec(21, 17)),
        extraParams: { from: address(bob) },
      });

    // --- TEST ---

    // check DefaultPool NEON and ZKUSD debt before
    const defaultPool_NEON_Before = await defaultPool.getNEON();
    const defaultPool_RawConflux_Before = await ethers.provider.getBalance(
      defaultPool.address
    );
    const defaultPool_ZKUSDDebt_Before = await defaultPool.getZKUSDDebt();

    expect(defaultPool_NEON_Before).to.be.eq(BigNumber.from("0"));
    expect(defaultPool_RawConflux_Before).to.be.eq(BigNumber.from("0"));
    expect(defaultPool_ZKUSDDebt_Before).to.be.eq(BigNumber.from("0"));

    // price drops to 1NEON:100ZKUSD, reducing Bob's ICR below MCR
    await contracts.priceFeedTestnet.setPrice(
      BigNumber.from("100000000000000000000")
    );

    // Confirm system is not in Recovery Mode
    expect(await th.checkRecoveryMode(contracts)).to.be.eq(false);

    // close Bob's Trove
    await contracts.troveManager.connect(owner).liquidate(address(bob));

    // check after
    const defaultPool_NEON_After = await defaultPool.getNEON();
    const defaultPool_RawConflux_After = await ethers.provider.getBalance(
      defaultPool.address
    );
    const defaultPool_ZKUSDDebt_After = await defaultPool.getZKUSDDebt();

    const defaultPool_NEON = th.applyLiquidationFee(B_collateral);
    expect(defaultPool_NEON_After).to.be.eq(defaultPool_NEON);
    expect(defaultPool_RawConflux_After).to.be.eq(defaultPool_NEON);
    th.assertIsApproximatelyEqual(defaultPool_ZKUSDDebt_After, B_totalDebt);
  });

  it("liquidate(): removes the Trove's stake from the total stakes", async () => {
    // --- SETUP ---
    const { collateral: A_collateral, totalDebt: A_totalDebt } =
      await openTrove(alice, {
        ICR: toBN(dec(4, 18)),
        extraParams: { from: address(alice) },
      });
    const { collateral: B_collateral, totalDebt: B_totalDebt } =
      await openTrove(bob, {
        ICR: toBN(dec(21, 17)),
        extraParams: { from: address(bob) },
      });

    // --- TEST ---

    // check totalStakes before
    const totalStakes_Before = await contracts.troveManager.totalStakes();
    expect(totalStakes_Before).to.be.eq(A_collateral.add(B_collateral));

    // price drops to 1NEON:100ZKUSD, reducing Bob's ICR below MCR
    await contracts.priceFeedTestnet.setPrice(
      BigNumber.from("100000000000000000000")
    );

    // Confirm system is not in Recovery Mode
    expect(await th.checkRecoveryMode(contracts)).to.be.eq(false);

    // Close Bob's Trove
    await contracts.troveManager.connect(owner).liquidate(address(bob));

    // check totalStakes after
    const totalStakes_After = await contracts.troveManager.totalStakes();
    expect(totalStakes_After).to.be.eq(A_collateral);
  });

  it("liquidate(): Removes the correct trove from the TroveOwners array, and moves the last array element to the new empty slot", async () => {
    // --- SETUP ---
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(whale) },
    });

    // Alice, Bob, Carol, Dennis, Erin open troves with consecutively decreasing collateral ratio
    await openTrove(alice, {
      ICR: toBN(dec(218, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(216, 16)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(214, 16)),
      extraParams: { from: address(carol) },
    });
    await openTrove(dennis, {
      ICR: toBN(dec(212, 16)),
      extraParams: { from: address(dennis) },
    });
    await openTrove(erin, {
      ICR: toBN(dec(210, 16)),
      extraParams: { from: address(erin) },
    });

    // At this stage, TroveOwners array should be: [W, A, B, C, D, E]

    // Drop price
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));

    const arrayLength_Before =
      await contracts.troveManager.getTroveOwnersCount();
    expect(arrayLength_Before).to.be.eq(6);

    // Confirm system is not in Recovery Mode
    expect(await th.checkRecoveryMode(contracts)).to.be.eq(false);

    // Liquidate carol
    await contracts.troveManager.connect(owner).liquidate(address(carol));

    // Check Carol no longer has an active trove
    expect(await contracts.sortedTroves.contains(address(carol))).to.be.eq(
      false
    );

    // Check length of array has decreased by 1
    const arrayLength_After =
      await contracts.troveManager.getTroveOwnersCount();
    expect(arrayLength_After).to.be.eq(5);

    /* After Carol is removed from array, the last element (Erin's address) should have been moved to fill
    the empty slot left by Carol, and the array length decreased by one.  The final TroveOwners array should be:

    [W, A, B, E, D]

    Check all remaining troves in the array are in the correct order */
    const trove_0 = await contracts.troveManager.TroveOwners(0);
    const trove_1 = await contracts.troveManager.TroveOwners(1);
    const trove_2 = await contracts.troveManager.TroveOwners(2);
    const trove_3 = await contracts.troveManager.TroveOwners(3);
    const trove_4 = await contracts.troveManager.TroveOwners(4);

    expect(trove_0).to.be.eq(await address(whale));
    expect(trove_1).to.be.eq(await address(alice));
    expect(trove_2).to.be.eq(await address(bob));
    expect(trove_3).to.be.eq(await address(erin));
    expect(trove_4).to.be.eq(await address(dennis));

    // Check correct indices recorded on the active trove structs
    const whale_arrayIndex = (
      await contracts.troveManager.Troves(address(whale))
    )[4];
    const alice_arrayIndex = (
      await contracts.troveManager.Troves(address(alice))
    )[4];
    const bob_arrayIndex = (
      await contracts.troveManager.Troves(address(bob))
    )[4];
    const dennis_arrayIndex = (
      await contracts.troveManager.Troves(address(dennis))
    )[4];
    const erin_arrayIndex = (
      await contracts.troveManager.Troves(address(erin))
    )[4];

    // [W, A, B, E, D]
    expect(whale_arrayIndex).to.be.eq(0);
    expect(alice_arrayIndex).to.be.eq(1);
    expect(bob_arrayIndex).to.be.eq(2);
    expect(erin_arrayIndex).to.be.eq(3);
    expect(dennis_arrayIndex).to.be.eq(4);
  });

  it("liquidate(): updates the snapshots of total stakes and total collateral", async () => {
    // --- SETUP ---
    const { collateral: A_collateral, totalDebt: A_totalDebt } =
      await openTrove(alice, {
        ICR: toBN(dec(4, 18)),
        extraParams: { from: address(alice) },
      });
    const { collateral: B_collateral, totalDebt: B_totalDebt } =
      await openTrove(bob, {
        ICR: toBN(dec(21, 17)),
        extraParams: { from: address(bob) },
      });

    // --- TEST ---

    // check snapshots before
    const totalStakesSnapshot_Before = (
      await contracts.troveManager.totalStakesSnapshot()
    ).toString();
    const totalCollateralSnapshot_Before = (
      await contracts.troveManager.totalCollateralSnapshot()
    ).toString();
    assertEqual(totalStakesSnapshot_Before, "0");
    assertEqual(totalCollateralSnapshot_Before, "0");

    // price drops to 1NEON:100ZKUSD, reducing Bob's ICR below MCR
    await contracts.priceFeedTestnet.setPrice("100000000000000000000");

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // close Bob's Trove.  His ether*0.995 and ZKUSD should be added to the DefaultPool.
    await contracts.troveManager.connect(owner).liquidate(address(bob));

    /* check snapshots after. Total stakes should be equal to the  remaining stake then the system:
    10 ether, Alice's stake.

    Total collateral should be equal to Alice's collateral plus her pending NEON reward (Bob’s collaterale*0.995 ether), earned
    from the liquidation of Bob's Trove */
    const totalStakesSnapshot_After =
      await contracts.troveManager.totalStakesSnapshot();
    const totalCollateralSnapshot_After =
      await contracts.troveManager.totalCollateralSnapshot();

    assertEqual(totalStakesSnapshot_After, A_collateral);
    assertEqual(
      totalCollateralSnapshot_After,
      A_collateral.add(th.applyLiquidationFee(B_collateral))
    );
  });

  it("liquidate(): updates the L_NEON and L_ZKUSDDebt reward-per-unit-staked totals", async () => {
    // --- SETUP ---
    const { collateral: A_collateral, totalDebt: A_totalDebt } =
      await openTrove(alice, {
        ICR: toBN(dec(8, 18)),
        extraParams: { from: address(alice) },
      });
    const { collateral: B_collateral, totalDebt: B_totalDebt } =
      await openTrove(bob, {
        ICR: toBN(dec(4, 18)),
        extraParams: { from: address(bob) },
      });
    const { collateral: C_collateral, totalDebt: C_totalDebt } =
      await openTrove(carol, {
        ICR: toBN(dec(111, 16)),
        extraParams: { from: address(carol) },
      });

    // --- TEST ---

    // price drops to 1NEON:100ZKUSD, reducing Carols's ICR below MCR
    await contracts.priceFeedTestnet.setPrice("100000000000000000000");

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // close Carol's Trove.
    assertTrue(await contracts.sortedTroves.contains(address(carol)));
    await contracts.troveManager.connect(owner).liquidate(address(carol));
    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    // Carol's ether*0.995 and ZKUSD should be added to the DefaultPool.
    const L_NEON_AfterCarolLiquidated = await contracts.troveManager.L_NEON();
    const L_ZKUSDDebt_AfterCarolLiquidated =
      await contracts.troveManager.L_ZKUSDDebt();

    const L_NEON_expected_1 = th
      .applyLiquidationFee(C_collateral)
      .mul(mv._1E18BN)
      .div(A_collateral.add(B_collateral));
    const L_ZKUSDDebt_expected_1 = C_totalDebt.mul(mv._1E18BN).div(
      A_collateral.add(B_collateral)
    );
    isAtMost(
      th.getDifference(L_NEON_AfterCarolLiquidated, L_NEON_expected_1),
      100
    );
    isAtMost(
      th.getDifference(
        L_ZKUSDDebt_AfterCarolLiquidated,
        L_ZKUSDDebt_expected_1
      ),
      100
    );

    // Bob now withdraws ZKUSD, bringing his ICR to 1.11
    const { increasedTotalDebt: B_increasedTotalDebt } = await withdrawZKUSD(
      bob,
      { ICR: toBN(dec(111, 16)), extraParams: { from: address(bob) } }
    );

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // price drops to 1NEON:50ZKUSD, reducing Bob's ICR below MCR
    await contracts.priceFeedTestnet.setPrice(dec(50, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    // close Bob's Trove
    assertTrue(await contracts.sortedTroves.contains(address(bob)));
    await contracts.troveManager.liquidate(address(bob));
    assertFalse(await contracts.sortedTroves.contains(address(bob)));

    /* Alice now has all the active stake. totalStakes in the system is now 10 ether.

   Bob's pending collateral reward and debt reward are applied to his Trove
   before his liquidation.
   His total collateral*0.995 and debt are then added to the DefaultPool.

   The system rewards-per-unit-staked should now be:

   L_NEON = (0.995 / 20) + (10.4975*0.995  / 10) = 1.09425125 NEON
   L_ZKUSDDebt = (180 / 20) + (890 / 10) = 98 ZKUSD */
    const L_NEON_AfterBobLiquidated = await contracts.troveManager.L_NEON();
    const L_ZKUSDDebt_AfterBobLiquidated =
      await contracts.troveManager.L_ZKUSDDebt();

    const L_NEON_expected_2 = L_NEON_expected_1.add(
      th
        .applyLiquidationFee(
          B_collateral.add(B_collateral.mul(L_NEON_expected_1).div(mv._1E18BN))
        )
        .mul(mv._1E18BN)
        .div(A_collateral)
    );
    const L_ZKUSDDebt_expected_2 = L_ZKUSDDebt_expected_1.add(
      B_totalDebt.add(B_increasedTotalDebt)
        .add(B_collateral.mul(L_ZKUSDDebt_expected_1).div(mv._1E18BN))
        .mul(mv._1E18BN)
        .div(A_collateral)
    );
    isAtMost(th.getDifference(L_NEON_AfterBobLiquidated, L_NEON_expected_2), 100);
    isAtMost(
      th.getDifference(L_ZKUSDDebt_AfterBobLiquidated, L_ZKUSDDebt_expected_2),
      100
    );
  });

  it("liquidate(): Liquidates undercollateralized trove if there are two troves in the system", async () => {
    await openTrove(bob, {
      ICR: toBN(dec(200, 18)),
      extraParams: { from: address(bob), value: dec(100, "ether") },
    });

    // Alice creates a single trove with 0.7 NEON and a debt of 70 ZKUSD, and provides 10 ZKUSD to SP
    const { collateral: A_collateral, totalDebt: A_totalDebt } =
      await openTrove(alice, {
        ICR: toBN(dec(2, 18)),
        extraParams: { from: address(alice) },
      });

    // Alice proves 10 ZKUSD to SP
    await contracts.stabilityPool.connect(alice).provideToSP(dec(10, 18));

    // Set NEON:USD price to 105
    await contracts.priceFeedTestnet.setPrice(
      BigNumber.from("105000000000000000000")
    );
    const price = await contracts.priceFeedTestnet.getPrice();

    assertFalse(await th.checkRecoveryMode(contracts));

    const alice_ICR = (
      await contracts.troveManager.getCurrentICR(address(alice), price)
    ).toString();
    assertEqual(alice_ICR, "1050000000000000000");

    const activeTrovesCount_Before =
      await contracts.troveManager.getTroveOwnersCount();

    assertEqual(activeTrovesCount_Before, 2);

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate the trove
    await contracts.troveManager.connect(owner).liquidate(address(alice));

    // Check Alice's trove is removed, and bob remains
    const activeTrovesCount_After =
      await contracts.troveManager.getTroveOwnersCount();
    assertEqual(activeTrovesCount_After, 1);

    const alice_isInSortedList = await contracts.sortedTroves.contains(
      address(alice)
    );
    assertFalse(alice_isInSortedList);

    const bob_isInSortedList = await contracts.sortedTroves.contains(
      address(bob)
    );
    assertTrue(bob_isInSortedList);
  });

  it("liquidate(): reverts if trove is non-existent", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(21, 17)),
      extraParams: { from: address(bob) },
    });

    assertEqual(await contracts.troveManager.getTroveStatus(address(carol)), 0); // check trove non-existent

    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    await expect(
      contracts.troveManager.liquidate(address(carol))
    ).to.be.revertedWith("TroveManager: Trove does not exist or is closed");
  });

  it("liquidate(): reverts if trove has been closed", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(8, 18)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(111, 16)),
      extraParams: { from: address(carol) },
    });

    assertTrue(await contracts.sortedTroves.contains(address(carol)));

    // price drops, Carol ICR falls below MCR
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    // Carol liquidated, and her trove is closed
    const txCarol_L1 = await contracts.troveManager.liquidate(address(carol));
    const receipt = await txCarol_L1.wait();
    assertTrue(receipt.status == 1);

    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    assertEqual(await contracts.troveManager.getTroveStatus(address(carol)), 3); // check trove closed by liquidation

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    await expect(
      contracts.troveManager.liquidate(address(carol))
    ).to.be.revertedWith("TroveManager: Trove does not exist or is closed");
  });

  it("liquidate(): does nothing if trove has >= 110% ICR", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(3, 18)),
      extraParams: { from: address(whale) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(3, 18)),
      extraParams: { from: address(bob) },
    });

    const TCR_Before = await th.getTCR(contracts);
    const listSize_Before = await contracts.sortedTroves.getSize();

    const price = await contracts.priceFeedTestnet.getPrice();

    // Check Bob's ICR > 110%
    const bob_ICR = await contracts.troveManager.getCurrentICR(
      address(bob),
      price
    );
    assertTrue(bob_ICR.gte(mv._MCR));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Attempt to liquidate bob
    await expect(
      contracts.troveManager.liquidate(address(bob))
    ).to.be.revertedWith("TroveManager: nothing to liquidate");

    // Check bob active, check whale active
    assertTrue(await contracts.sortedTroves.contains(address(bob)));
    assertTrue(await contracts.sortedTroves.contains(address(whale)));

    const TCR_After = (await th.getTCR(contracts)).toString();
    const listSize_After = (await contracts.sortedTroves.getSize()).toString();

    assertEqual(TCR_Before, TCR_After);
    assertEqual(listSize_Before, listSize_After);
  });

  it("liquidate(): Given the same price and no other trove changes, complete Pool offsets restore the TCR to its value prior to the defaulters opening troves", async () => {
    // Whale provides ZKUSD to SP
    const spDeposit = toBN(dec(100, 24));
    await openTrove(whale, {
      ICR: toBN(dec(4, 18)),
      extraZKUSDAmount: spDeposit,
      extraParams: { from: address(whale) },
    });
    await contracts.stabilityPool.connect(whale).provideToSP(spDeposit);

    await openTrove(alice, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(70, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(carol) },
    });
    await openTrove(dennis, {
      ICR: toBN(dec(200, 18)),
      extraParams: { from: address(dennis) },
    });

    const TCR_Before = await th.getTCR(contracts);

    await openTrove(defaulter_1, {
      ICR: toBN(dec(202, 16)),
      extraParams: { from: address(defaulter_1) },
    });
    await openTrove(defaulter_2, {
      ICR: toBN(dec(190, 16)),
      extraParams: { from: address(defaulter_2) },
    });
    await openTrove(defaulter_3, {
      ICR: toBN(dec(196, 16)),
      extraParams: { from: address(defaulter_3) },
    });
    await openTrove(defaulter_4, {
      ICR: toBN(dec(200, 16)),
      extraParams: { from: address(defaulter_4) },
    });

    assertTrue(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_2)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_3)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_4)));

    // Price drop
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // All defaulters liquidated
    await contracts.troveManager.liquidate(address(defaulter_1));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));

    await contracts.troveManager.liquidate(address(defaulter_2));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_2)));

    await contracts.troveManager.liquidate(address(defaulter_3));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_3)));

    await contracts.troveManager.liquidate(address(defaulter_4));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_4)));

    // Price bounces back
    await contracts.priceFeedTestnet.setPrice(toBN(dec(200, 18)));

    const TCR_After = await th.getTCR(contracts);
    assertEqual(TCR_Before, TCR_After);
  });

  it("liquidate(): Pool offsets increase the TCR", async () => {
    // Whale provides ZKUSD to SP
    const spDeposit = toBN(dec(100, 24));
    await openTrove(whale, {
      ICR: toBN(dec(4, 18)),
      extraZKUSDAmount: spDeposit,
      extraParams: { from: address(whale) },
    });
    await contracts.stabilityPool.connect(whale).provideToSP(spDeposit);

    await openTrove(alice, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(70, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(carol) },
    });
    await openTrove(dennis, {
      ICR: toBN(dec(200, 18)),
      extraParams: { from: address(dennis) },
    });

    await openTrove(defaulter_1, {
      ICR: toBN(dec(202, 16)),
      extraParams: { from: address(defaulter_1) },
    });
    await openTrove(defaulter_2, {
      ICR: toBN(dec(190, 16)),
      extraParams: { from: address(defaulter_2) },
    });
    await openTrove(defaulter_3, {
      ICR: toBN(dec(196, 16)),
      extraParams: { from: address(defaulter_3) },
    });
    await openTrove(defaulter_4, {
      ICR: toBN(dec(200, 16)),
      extraParams: { from: address(defaulter_4) },
    });

    assertTrue(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_2)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_3)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_4)));

    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    const TCR_1 = await th.getTCR(contracts);

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Check TCR improves with each liquidation that is offset with Pool
    await contracts.troveManager.liquidate(address(defaulter_1));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));
    const TCR_2 = await th.getTCR(contracts);
    assertTrue(TCR_2.gte(TCR_1));

    await contracts.troveManager.liquidate(address(defaulter_2));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_2)));
    const TCR_3 = await th.getTCR(contracts);
    assertTrue(TCR_3.gte(TCR_2));

    await contracts.troveManager.liquidate(address(defaulter_3));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_3)));
    const TCR_4 = await th.getTCR(contracts);
    assertTrue(TCR_4.gte(TCR_3));

    await contracts.troveManager.liquidate(address(defaulter_4));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_4)));
    const TCR_5 = await th.getTCR(contracts);
    assertTrue(TCR_5.gte(TCR_4));
  });

  it("liquidate(): a pure redistribution reduces the TCR only as a result of compensation", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(whale) },
    });

    await openTrove(alice, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(70, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(carol) },
    });
    await openTrove(dennis, {
      ICR: toBN(dec(200, 18)),
      extraParams: { from: address(dennis) },
    });

    await openTrove(defaulter_1, {
      ICR: toBN(dec(202, 16)),
      extraParams: { from: address(defaulter_1) },
    });
    await openTrove(defaulter_2, {
      ICR: toBN(dec(190, 16)),
      extraParams: { from: address(defaulter_2) },
    });
    await openTrove(defaulter_3, {
      ICR: toBN(dec(196, 16)),
      extraParams: { from: address(defaulter_3) },
    });
    await openTrove(defaulter_4, {
      ICR: toBN(dec(200, 16)),
      extraParams: { from: address(defaulter_4) },
    });

    assertTrue(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_2)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_3)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_4)));

    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    const TCR_0 = await th.getTCR(contracts);

    const entireSystemCollBefore =
      await contracts.troveManager.getEntireSystemColl();
    const entireSystemDebtBefore =
      await contracts.troveManager.getEntireSystemDebt();

    const expectedTCR_0 = entireSystemCollBefore
      .mul(price)
      .div(entireSystemDebtBefore);

    assertTrue(expectedTCR_0.eq(TCR_0));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Check TCR does not decrease with each liquidation
    const liquidationTx_1 = await contracts.troveManager.liquidate(
      address(defaulter_1)
    );
    const [liquidatedDebt_1, liquidatedColl_1, gasComp_1] =
      await th.getEmittedLiquidationValues(contracts, liquidationTx_1);
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));
    const TCR_1 = await th.getTCR(contracts);

    // Expect only change to TCR to be due to the issued gas compensation
    const expectedTCR_1 = entireSystemCollBefore
      .sub(gasComp_1)
      .mul(price)
      .div(entireSystemDebtBefore);

    assertTrue(expectedTCR_1.eq(TCR_1));

    const liquidationTx_2 = await contracts.troveManager.liquidate(
      address(defaulter_2)
    );
    const [liquidatedDebt_2, liquidatedColl_2, gasComp_2] =
      await th.getEmittedLiquidationValues(contracts, liquidationTx_2);
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_2)));

    const TCR_2 = await th.getTCR(contracts);

    const expectedTCR_2 = entireSystemCollBefore
      .sub(gasComp_1)
      .sub(gasComp_2)
      .mul(price)
      .div(entireSystemDebtBefore);

    assertTrue(expectedTCR_2.eq(TCR_2));

    const liquidationTx_3 = await contracts.troveManager.liquidate(
      address(defaulter_3)
    );
    const [liquidatedDebt_3, liquidatedColl_3, gasComp_3] =
      await th.getEmittedLiquidationValues(contracts, liquidationTx_3);
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_3)));

    const TCR_3 = await th.getTCR(contracts);

    const expectedTCR_3 = entireSystemCollBefore
      .sub(gasComp_1)
      .sub(gasComp_2)
      .sub(gasComp_3)
      .mul(price)
      .div(entireSystemDebtBefore);

    assertTrue(expectedTCR_3.eq(TCR_3));

    const liquidationTx_4 = await contracts.troveManager.liquidate(
      address(defaulter_4)
    );
    const [liquidatedDebt_4, liquidatedColl_4, gasComp_4] =
      await th.getEmittedLiquidationValues(contracts, liquidationTx_4);
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_4)));

    const TCR_4 = await th.getTCR(contracts);

    const expectedTCR_4 = entireSystemCollBefore
      .sub(gasComp_1)
      .sub(gasComp_2)
      .sub(gasComp_3)
      .sub(gasComp_4)
      .mul(price)
      .div(entireSystemDebtBefore);

    assertTrue(expectedTCR_4.eq(TCR_4));
  });

  it("liquidate(): does not affect the SP deposit or NEON gain when called on an SP depositor's address that has no trove", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(whale) },
    });
    const spDeposit = toBN(dec(1, 24));
    await openTrove(bob, {
      ICR: toBN(dec(3, 18)),
      extraZKUSDAmount: spDeposit,
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(218, 16)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(carol) },
    });
    // Bob sends tokens to Dennis, who has no trove
    await zkusdToken.connect(bob).transfer(address(dennis), spDeposit);

    //Dennis provides ZKUSD to SP
    await contracts.stabilityPool.connect(dennis).provideToSP(spDeposit);

    // Carol gets liquidated
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const liquidationTX_C = await contracts.troveManager.liquidate(
      address(carol)
    );
    const [liquidatedDebt, liquidatedColl, gasComp] =
      await th.getEmittedLiquidationValues(contracts, liquidationTX_C);

    assertFalse(await contracts.sortedTroves.contains(address(carol)));
    // Check Dennis' SP deposit has absorbed Carol's debt, and he has received her liquidated NEON
    const dennis_Deposit_Before =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(dennis));
    const dennis_NEONGain_Before =
      await contracts.stabilityPool.getDepositorNEONGain(address(dennis));
    isAtMost(
      th.getDifference(dennis_Deposit_Before, spDeposit.sub(liquidatedDebt)),
      1000000
    );
    isAtMost(th.getDifference(dennis_NEONGain_Before, liquidatedColl), 1000);

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Attempt to liquidate Dennis
    await expect(
      contracts.troveManager.liquidate(address(dennis))
    ).to.be.revertedWith("TroveManager: Trove does not exist or is closed");

    // Check Dennis' SP deposit does not change after liquidation attempt
    const dennis_Deposit_After =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(dennis));
    const dennis_NEONGain_After =
      await contracts.stabilityPool.getDepositorNEONGain(address(dennis));
    assertEqual(dennis_Deposit_Before, dennis_Deposit_After);
    assertEqual(dennis_NEONGain_Before, dennis_NEONGain_After);
  });

  it("liquidate(): does not liquidate a SP depositor's trove with ICR > 110%, and does not affect their SP deposit or NEON gain", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(whale) },
    });
    const spDeposit = toBN(dec(1, 24));
    await openTrove(bob, {
      ICR: toBN(dec(3, 18)),
      extraZKUSDAmount: spDeposit,
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(218, 16)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(carol) },
    });

    //Bob provides ZKUSD to SP
    await contracts.stabilityPool.connect(bob).provideToSP(spDeposit);

    // Carol gets liquidated
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));
    const liquidationTX_C = await contracts.troveManager.liquidate(
      address(carol)
    );
    const [liquidatedDebt, liquidatedColl, gasComp] =
      await th.getEmittedLiquidationValues(contracts, liquidationTX_C);
    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    // price bounces back - Bob's trove is >110% ICR again
    await contracts.priceFeedTestnet.setPrice(toBN(dec(200, 18)));
    const price = await contracts.priceFeedTestnet.getPrice();
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(bob), price)).gt(
        mv._MCR
      )
    );

    // Check Bob' SP deposit has absorbed Carol's debt, and he has received her liquidated NEON
    const bob_Deposit_Before =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(bob));
    const bob_NEONGain_Before =
      await contracts.stabilityPool.getDepositorNEONGain(address(bob));
    isAtMost(
      th.getDifference(bob_Deposit_Before, spDeposit.sub(liquidatedDebt)),
      1000000
    );
    isAtMost(th.getDifference(bob_NEONGain_Before, liquidatedColl), 1000);

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Attempt to liquidate Bob
    await expect(
      contracts.troveManager.liquidate(address(bob))
    ).to.be.revertedWith("TroveManager: nothing to liquidate");

    // Confirm Bob's trove is still active
    assertTrue(await contracts.sortedTroves.contains(address(bob)));

    // Check Bob' SP deposit does not change after liquidation attempt
    const bob_Deposit_After =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(bob));
    const bob_NEONGain_After = await contracts.stabilityPool.getDepositorNEONGain(
      address(bob)
    );
    assertEqual(bob_Deposit_Before, bob_Deposit_After);
    assertEqual(bob_NEONGain_Before, bob_NEONGain_After);
  });

  it("liquidate(): liquidates a SP depositor's trove with ICR < 110%, and the liquidation correctly impacts their SP deposit and NEON gain", async () => {
    const A_spDeposit = toBN(dec(3, 24));
    const B_spDeposit = toBN(dec(1, 24));
    await openTrove(whale, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(whale) },
    });
    await openTrove(alice, {
      ICR: toBN(dec(8, 18)),
      extraZKUSDAmount: A_spDeposit,
      extraParams: { from: address(alice) },
    });
    const { collateral: B_collateral, totalDebt: B_debt } = await openTrove(
      bob,
      {
        ICR: toBN(dec(218, 16)),
        extraZKUSDAmount: B_spDeposit,
        extraParams: { from: address(bob) },
      }
    );
    const { collateral: C_collateral, totalDebt: C_debt } = await openTrove(
      carol,
      {
        ICR: toBN(dec(210, 16)),
        extraZKUSDAmount: toBN(dec(100, 18)),
        extraParams: { from: address(carol) },
      }
    );

    //Bob provides ZKUSD to SP
    await contracts.stabilityPool.connect(bob).provideToSP(B_spDeposit);

    // Carol gets liquidated
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    await contracts.troveManager.liquidate(address(carol));

    // Check Bob' SP deposit has absorbed Carol's debt, and he has received her liquidated NEON
    const bob_Deposit_Before =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(bob));
    const bob_NEONGain_Before =
      await contracts.stabilityPool.getDepositorNEONGain(address(bob));
    isAtMost(
      th.getDifference(bob_Deposit_Before, B_spDeposit.sub(C_debt)),
      1000000
    );
    isAtMost(
      th.getDifference(
        bob_NEONGain_Before,
        th.applyLiquidationFee(C_collateral)
      ),
      1000
    );

    // Alice provides ZKUSD to SP
    await contracts.stabilityPool.connect(alice).provideToSP(A_spDeposit);

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate Bob
    await contracts.troveManager.liquidate(address(bob));

    // Confirm Bob's trove has been closed
    assertFalse(await contracts.sortedTroves.contains(address(bob)));
    const bob_Trove_Status = (
      await contracts.troveManager.Troves(address(bob))
    )[3];
    assertEqual(bob_Trove_Status, 3); // check closed by liquidation

    /* Alice's ZKUSD Loss = (300 / 400) * 200 = 150 ZKUSD
       Alice's NEON gain = (300 / 400) * 2*0.995 = 1.4925 NEON

       Bob's ZKUSDLoss = (100 / 400) * 200 = 50 ZKUSD
       Bob's NEON gain = (100 / 400) * 2*0.995 = 0.4975 NEON

     Check Bob' SP deposit has been reduced to 50 ZKUSD, and his NEON gain has increased to 1.5 NEON. */
    const alice_Deposit_After =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(alice));
    const alice_NEONGain_After =
      await contracts.stabilityPool.getDepositorNEONGain(address(alice));

    const totalDeposits = bob_Deposit_Before.add(A_spDeposit);

    isAtMost(
      th.getDifference(
        alice_Deposit_After,
        A_spDeposit.sub(B_debt.mul(A_spDeposit).div(totalDeposits))
      ),
      1000000
    );
    isAtMost(
      th.getDifference(
        alice_NEONGain_After,
        th.applyLiquidationFee(B_collateral).mul(A_spDeposit).div(totalDeposits)
      ),
      1000000
    );

    const bob_Deposit_After =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(bob));
    const bob_NEONGain_After = await contracts.stabilityPool.getDepositorNEONGain(
      address(bob)
    );

    isAtMost(
      th.getDifference(
        bob_Deposit_After,
        bob_Deposit_Before.sub(
          B_debt.mul(bob_Deposit_Before).div(totalDeposits)
        )
      ),
      1000000
    );
    isAtMost(
      th.getDifference(
        bob_NEONGain_After,
        bob_NEONGain_Before.add(
          th
            .applyLiquidationFee(B_collateral)
            .mul(bob_Deposit_Before)
            .div(totalDeposits)
        )
      ),
      1000000
    );
  });

  it("liquidate(): does not alter the liquidated user's token balance", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(whale) },
    });
    const { rusdAmount: A_rusdAmount } = await openTrove(alice, {
      ICR: toBN(dec(2, 18)),
      extraZKUSDAmount: toBN(dec(300, 18)),
      extraParams: { from: address(alice) },
    });
    const { rusdAmount: B_rusdAmount } = await openTrove(bob, {
      ICR: toBN(dec(2, 18)),
      extraZKUSDAmount: toBN(dec(200, 18)),
      extraParams: { from: address(bob) },
    });
    const { rusdAmount: C_rusdAmount } = await openTrove(carol, {
      ICR: toBN(dec(2, 18)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(carol) },
    });

    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    // Check sortedList size
    assertEqual(await contracts.sortedTroves.getSize(), 4);

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate A, B and C
    const activeZKUSDDebt_0 = await activePool.getZKUSDDebt();
    const defaultZKUSDDebt_0 = await defaultPool.getZKUSDDebt();

    await contracts.troveManager.liquidate(address(alice));
    const activeZKUSDDebt_A = await activePool.getZKUSDDebt();
    const defaultZKUSDDebt_A = await defaultPool.getZKUSDDebt();

    await contracts.troveManager.liquidate(address(bob));
    const activeZKUSDDebt_B = await activePool.getZKUSDDebt();
    const defaultZKUSDDebt_B = await defaultPool.getZKUSDDebt();

    await contracts.troveManager.liquidate(address(carol));

    // Confirm A, B, C closed
    assertFalse(await contracts.sortedTroves.contains(address(alice)));
    assertFalse(await contracts.sortedTroves.contains(address(bob)));
    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    // Check sortedList size reduced to 1
    assertEqual(await contracts.sortedTroves.getSize(), 1);

    // Confirm token balances have not changed
    assertEqual(
      (await zkusdToken.balanceOf(address(alice))).toString(),
      A_rusdAmount
    );
    assertEqual(
      (await zkusdToken.balanceOf(address(bob))).toString(),
      B_rusdAmount
    );
    assertEqual(
      (await zkusdToken.balanceOf(address(carol))).toString(),
      C_rusdAmount
    );
  });

  it("liquidate(): liquidates based on entire/collateral debt (including pending rewards), not raw collateral/debt", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(8, 18)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(alice) },
    });

    await openTrove(bob, {
      ICR: toBN(dec(221, 16)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(bob) },
    });

    await openTrove(carol, {
      ICR: toBN(dec(2, 18)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(carol) },
    });

    // Defaulter opens with 60 ZKUSD, 0.6 NEON
    await openTrove(defaulter_1, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(defaulter_1) },
    });

    // Price drops
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));
    const price = await contracts.priceFeedTestnet.getPrice();

    const alice_ICR_Before = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );
    const bob_ICR_Before = await contracts.troveManager.getCurrentICR(
      address(bob),
      price
    );
    const carol_ICR_Before = await contracts.troveManager.getCurrentICR(
      address(carol),
      price
    );

    /* Before liquidation:
    Alice ICR: = (2 * 100 / 50) = 400%
    Bob ICR: (1 * 100 / 90.5) = 110.5%
    Carol ICR: (1 * 100 / 100 ) =  100%

    Therefore Alice and Bob above the MCR, Carol is below */
    assertTrue(alice_ICR_Before.gte(mv._MCR));
    assertTrue(bob_ICR_Before.gte(mv._MCR));
    assertTrue(carol_ICR_Before.lte(mv._MCR));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    /* Liquidate defaulter. 30 ZKUSD and 0.3 NEON is distributed between A, B and C.

    A receives (30 * 2/4) = 15 ZKUSD, and (0.3*2/4) = 0.15 NEON
    B receives (30 * 1/4) = 7.5 ZKUSD, and (0.3*1/4) = 0.075 NEON
    C receives (30 * 1/4) = 7.5 ZKUSD, and (0.3*1/4) = 0.075 NEON
    */
    await contracts.troveManager.liquidate(address(defaulter_1));

    const alice_ICR_After = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );
    const bob_ICR_After = await contracts.troveManager.getCurrentICR(
      address(bob),
      price
    );
    const carol_ICR_After = await contracts.troveManager.getCurrentICR(
      address(carol),
      price
    );

    /* After liquidation:

    Alice ICR: (10.15 * 100 / 60) = 183.33%
    Bob ICR:(1.075 * 100 / 98) =  109.69%
    Carol ICR: (1.075 *100 /  107.5 ) = 100.0%

    Check Alice is above MCR, Bob below, Carol below. */

    assertTrue(alice_ICR_After.gte(mv._MCR));
    assertTrue(bob_ICR_After.lte(mv._MCR));
    assertTrue(carol_ICR_After.lte(mv._MCR));

    /* Though Bob's true ICR (including pending rewards) is below the MCR,
    check that Bob's raw coll and debt has not changed, and that his "raw" ICR is above the MCR */
    const bob_Coll = (await contracts.troveManager.Troves(address(bob)))[1];
    const bob_Debt = (await contracts.troveManager.Troves(address(bob)))[0];

    const bob_rawICR = bob_Coll.mul(toBN(dec(100, 18))).div(bob_Debt);
    assertTrue(bob_rawICR.gte(mv._MCR));

    // Whale enters system, pulling it into Normal Mode
    await openTrove(whale, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(whale) },
    });
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate Alice, Bob, Carol
    await expect(
      contracts.troveManager.liquidate(address(alice)),
      "TroveManager: nothing to liquidate"
    );
    await contracts.troveManager.liquidate(address(bob));
    await contracts.troveManager.liquidate(address(carol));

    /* Check Alice stays active, Carol gets liquidated, and Bob gets liquidated
   (because his pending rewards bring his ICR < MCR) */
    assertTrue(await contracts.sortedTroves.contains(address(alice)));
    assertFalse(await contracts.sortedTroves.contains(address(bob)));
    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    // Check trove statuses - A active (1),  B and C liquidated (3)
    assertEqual(
      (await contracts.troveManager.Troves(address(alice)))[3].toString(),
      "1"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(bob)))[3].toString(),
      "3"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(carol)))[3].toString(),
      "3"
    );
  });

  it("liquidate(): when SP > 0, triggers LQTY reward event - increases the sum G", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(100, 18)),
      extraParams: { from: address(whale) },
    });

    // A, B, C open troves
    await openTrove(A, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(A) },
    });
    await openTrove(B, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(B) },
    });
    await openTrove(C, {
      ICR: toBN(dec(3, 18)),
      extraParams: { from: address(C) },
    });

    await openTrove(defaulter_1, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(defaulter_1) },
    });

    // B provides to SP
    await contracts.stabilityPool.connect(B).provideToSP(dec(100, 18));
    assertEqual(
      await contracts.stabilityPool.getTotalZKUSDDeposits(),
      toBN(dec(100, 18))
    );

    const G_Before = await contracts.stabilityPool.epochToScaleToG(0, 0);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR);

    // Price drops to 1NEON:100ZKUSD, reducing defaulters to below MCR
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));
    const price = await contracts.priceFeedTestnet.getPrice();
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate trove
    await contracts.troveManager.liquidate(address(defaulter_1));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));

    const G_After = await contracts.stabilityPool.epochToScaleToG(0, 0);

    // Expect G has increased from the LQTY reward event triggered
    assertTrue(G_After.gt(G_Before));
  });

  it("liquidate(): when SP is empty, doesn't update G", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(100, 18)),
      extraParams: { from: address(whale) },
    });

    // A, B, C open troves
    await openTrove(A, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(A) },
    });
    await openTrove(B, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(B) },
    });
    await openTrove(C, {
      ICR: toBN(dec(3, 18)),
      extraParams: { from: address(C) },
    });

    await openTrove(defaulter_1, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(defaulter_1) },
    });

    // B provides to SP
    await contracts.stabilityPool.connect(B).provideToSP(toBN(dec(100, 18)));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR);

    // B withdraws
    await contracts.stabilityPool.connect(B).withdrawFromSP(toBN(dec(100, 18)));

    // Check SP is empty
    assertEqual(await contracts.stabilityPool.getTotalZKUSDDeposits(), 0);

    // Check G is non-zero
    const G_Before = await contracts.stabilityPool.epochToScaleToG(0, 0);
    assertTrue(G_Before.gt(toBN("0")));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR);

    // Price drops to 1NEON:100ZKUSD, reducing defaulters to below MCR
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));
    const price = await contracts.priceFeedTestnet.getPrice();
    assertFalse(await th.checkRecoveryMode(contracts));

    // liquidate trove
    await contracts.troveManager.liquidate(address(defaulter_1));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));

    const G_After = await contracts.stabilityPool.epochToScaleToG(0, 0);

    // Expect G has not changed
    assertTrue(G_After.eq(G_Before));
  });

  // --- liquidateTroves() ---

  it("liquidateTroves(): liquidates a Trove that a) was skipped in a previous liquidation and b) has pending rewards", async () => {
    // A, B, C, D, E open troves
    await openTrove(D, {
      ICR: toBN(dec(333, 16)),
      extraParams: { from: address(D) },
    });
    await openTrove(E, {
      ICR: toBN(dec(333, 16)),
      extraParams: { from: address(E) },
    });
    await openTrove(A, {
      ICR: toBN(dec(120, 16)),
      extraParams: { from: address(A) },
    });
    await openTrove(B, {
      ICR: toBN(dec(133, 16)),
      extraParams: { from: address(B) },
    });
    await openTrove(C, {
      ICR: toBN(dec(3, 18)),
      extraParams: { from: address(C) },
    }); // Price drops
    await contracts.priceFeedTestnet.setPrice(toBN(dec(175, 18)));
    let price = await contracts.priceFeedTestnet.getPrice();

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // A gets liquidated, creates pending rewards for all
    const liqTxA = await contracts.troveManager.liquidate(address(A));
    const receipt = await liqTxA.wait();
    assertTrue(receipt.status == 1);
    assertFalse(await contracts.sortedTroves.contains(address(A)));

    // A adds 10 ZKUSD to the SP, but less than C's debt
    await contracts.stabilityPool.connect(A).provideToSP(dec(10, 18));

    // Price drops
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));
    price = await contracts.priceFeedTestnet.getPrice();
    // Confirm system is now in Recovery Mode
    assertTrue(await th.checkRecoveryMode(contracts));

    // Confirm C has ICR > TCR
    const TCR = await contracts.troveManager.getTCR(price);
    const ICR_C = await contracts.troveManager.getCurrentICR(address(C), price);

    assertTrue(ICR_C.gt(TCR));

    // Attempt to liquidate B and C, which skips C in the liquidation since it is immune
    const liqTxBC = await contracts.troveManager.liquidateTroves(2);
    const receiptBC = await liqTxBC.wait();
    assertTrue(receiptBC.status == 1);
    assertFalse(await contracts.sortedTroves.contains(address(B)));
    assertTrue(await contracts.sortedTroves.contains(address(C)));
    assertTrue(await contracts.sortedTroves.contains(address(D)));
    assertTrue(await contracts.sortedTroves.contains(address(E)));

    // // All remaining troves D and E repay a little debt, applying their pending rewards
    assertTrue((await contracts.sortedTroves.getSize()).eq(toBN("3")));
    await contracts.borrowerOperations
      .connect(D)
      .repayZKUSD(toBN(dec(1, 18)), address(D), address(D));
    await contracts.borrowerOperations
      .connect(E)
      .repayZKUSD(toBN(dec(1, 18)), address(E), address(E));

    // Check C is the only trove that has pending rewards
    assertTrue(await contracts.troveManager.hasPendingRewards(address(C)));
    assertFalse(await contracts.troveManager.hasPendingRewards(address(D)));
    assertFalse(await contracts.troveManager.hasPendingRewards(address(E)));

    // Check C's pending coll and debt rewards are <= the coll and debt in the DefaultPool
    const pendingNEON_C = await contracts.troveManager.getPendingNEONReward(
      address(C)
    );
    const pendingZKUSDDebt_C =
      await contracts.troveManager.getPendingZKUSDDebtReward(address(C));
    const defaultPoolNEON = await defaultPool.getNEON();
    const defaultPoolZKUSDDebt = await defaultPool.getZKUSDDebt();
    assertTrue(pendingNEON_C.lte(defaultPoolNEON));
    assertTrue(pendingZKUSDDebt_C.lte(defaultPoolZKUSDDebt));
    //Check only difference is dust
    isAtMost(th.getDifference(pendingNEON_C, defaultPoolNEON), 1000);
    isAtMost(th.getDifference(pendingZKUSDDebt_C, defaultPoolZKUSDDebt), 1000);

    // Confirm system is still in Recovery Mode
    assertTrue(await th.checkRecoveryMode(contracts));

    // D and E fill the Stability Pool, enough to completely absorb C's debt of 70
    await contracts.stabilityPool.connect(D).provideToSP(dec(50, 18));
    await contracts.stabilityPool.connect(E).provideToSP(dec(50, 18));

    await contracts.priceFeedTestnet.setPrice(dec(50, 18));

    // Try to liquidate C again. Check it succeeds and closes C's trove
    const liqTx2 = await contracts.troveManager.liquidateTroves(2);
    const receipt2 = await liqTx2.wait();
    assertTrue(receipt.status == 1);
    assertFalse(await contracts.sortedTroves.contains(address(C)));
    assertFalse(await contracts.sortedTroves.contains(address(D)));
    assertTrue(await contracts.sortedTroves.contains(address(E)));
    assertTrue((await contracts.sortedTroves.getSize()).eq(toBN("1")));
  });

  it("liquidateTroves(): closes every Trove with ICR < MCR, when n > number of undercollateralized troves", async () => {
    // --- SETUP ---
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(whale) },
    });

    // create 5 Troves with varying ICRs
    await openTrove(alice, {
      ICR: toBN(dec(200, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(190, 16)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(210, 16)),
      extraParams: { from: address(carol) },
    });
    await openTrove(erin, {
      ICR: toBN(dec(195, 16)),
      extraParams: { from: address(erin) },
    });
    await openTrove(flyn, {
      ICR: toBN(dec(120, 16)),
      extraParams: { from: address(flyn) },
    });

    // G,H, I open high-ICR troves
    await openTrove(graham, {
      ICR: toBN(dec(100, 18)),
      extraParams: { from: address(graham) },
    });
    await openTrove(harriet, {
      ICR: toBN(dec(90, 18)),
      extraParams: { from: address(harriet) },
    });
    await openTrove(ida, {
      ICR: toBN(dec(80, 18)),
      extraParams: { from: address(ida) },
    });

    // Whale puts some tokens in Stability Pool
    await contracts.stabilityPool
      .connect(whale)
      .provideToSP(toBN(dec(300, 18)));

    // --- TEST ---

    // Price drops to 1NEON:100ZKUSD, reducing Bob and Carol's ICR below MCR
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));
    const price = await contracts.priceFeedTestnet.getPrice();

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Confirm troves A-E are ICR < 110%
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(alice), price)).lte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(bob), price)).lte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(carol), price)).lte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(erin), price)).lte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(flyn), price)).lte(
        mv._MCR
      )
    );

    // Confirm troves G, H, I are ICR > 110%
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(graham), price)).gte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(harriet), price)).gte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(ida), price)).gte(
        mv._MCR
      )
    );

    // Confirm Whale is ICR > 110%
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(whale), price)).gte(
        mv._MCR
      )
    );

    // Liquidate 5 troves
    await contracts.troveManager.liquidateTroves(5);

    // Confirm troves A-E have been removed from the system
    assertFalse(await contracts.sortedTroves.contains(address(alice)));
    assertFalse(await contracts.sortedTroves.contains(address(bob)));
    assertFalse(await contracts.sortedTroves.contains(address(carol)));
    assertFalse(await contracts.sortedTroves.contains(address(dennis)));
    assertFalse(await contracts.sortedTroves.contains(address(erin)));

    // Check all troves A-E are now closed by liquidation
    assertEqual(
      (await contracts.troveManager.Troves(address(alice)))[3].toString(),
      "3"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(bob)))[3].toString(),
      "3"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(carol)))[3].toString(),
      "3"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(erin)))[3].toString(),
      "3"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(flyn)))[3].toString(),
      "3"
    );

    // Check sorted list has been reduced to length 4
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "4");
  });

  it("liquidateTroves(): liquidates  up to the requested number of undercollateralized troves", async () => {
    // --- SETUP ---
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(whale) },
    });

    // Alice, Bob, Carol, Dennis, Erin open troves with consecutively decreasing collateral ratio
    await openTrove(alice, {
      ICR: toBN(dec(202, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(204, 16)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(206, 16)),
      extraParams: { from: address(carol) },
    });
    await openTrove(dennis, {
      ICR: toBN(dec(208, 16)),
      extraParams: { from: address(dennis) },
    });
    await openTrove(erin, {
      ICR: toBN(dec(210, 16)),
      extraParams: { from: address(erin) },
    });

    // --- TEST ---

    // Price drops
    await contracts.priceFeedTestnet.setPrice(toBN(dec(100, 18)));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    await contracts.troveManager.liquidateTroves(3);

    const TroveOwnersArrayLength =
      await contracts.troveManager.getTroveOwnersCount();
    assertEqual(TroveOwnersArrayLength, "3");

    // Check Alice, Bob, Carol troves have been closed
    const aliceTroveStatus = (
      await contracts.troveManager.getTroveStatus(address(alice))
    ).toString();
    const bobTroveStatus = (
      await contracts.troveManager.getTroveStatus(address(bob))
    ).toString();
    const carolTroveStatus = (
      await contracts.troveManager.getTroveStatus(address(carol))
    ).toString();

    assertEqual(aliceTroveStatus, "3");
    assertEqual(bobTroveStatus, "3");
    assertEqual(carolTroveStatus, "3");

    //  Check Alice, Bob, and Carol's trove are no longer in the sorted list
    const alice_isInSortedList = await contracts.sortedTroves.contains(
      address(alice)
    );
    const bob_isInSortedList = await contracts.sortedTroves.contains(
      address(bob)
    );
    const carol_isInSortedList = await contracts.sortedTroves.contains(
      address(carol)
    );

    assertFalse(alice_isInSortedList);
    assertFalse(bob_isInSortedList);
    assertFalse(carol_isInSortedList);

    // Check Dennis, Erin still have active troves
    const dennisTroveStatus = (
      await contracts.troveManager.getTroveStatus(address(dennis))
    ).toString();
    const erinTroveStatus = (
      await contracts.troveManager.getTroveStatus(address(erin))
    ).toString();

    assertEqual(dennisTroveStatus, "1");
    assertEqual(erinTroveStatus, "1");

    // Check Dennis, Erin still in sorted list
    const dennis_isInSortedList = await contracts.sortedTroves.contains(
      address(dennis)
    );
    const erin_isInSortedList = await contracts.sortedTroves.contains(
      address(erin)
    );

    assertTrue(dennis_isInSortedList);
    assertTrue(erin_isInSortedList);
  });

  it("liquidateTroves(): does nothing if all troves have ICR > 110%", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(whale) },
    });

    // Alice, Bob, Carol open troves with the same collateral ratio
    await openTrove(alice, {
      ICR: toBN(dec(222, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(222, 16)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(222, 16)),
      extraParams: { from: address(carol) },
    });

    // Price drops, but all troves remain active at 111% ICR
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    assertTrue(await contracts.sortedTroves.contains(address(whale)));
    assertTrue(await contracts.sortedTroves.contains(address(alice)));
    assertTrue(await contracts.sortedTroves.contains(address(bob)));
    assertTrue(await contracts.sortedTroves.contains(address(carol)));

    const TCR_Before = (await th.getTCR(contracts)).toString();
    const listSize_Before = (await contracts.sortedTroves.getSize()).toString();

    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(whale), price)).gte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(alice), price)).gte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(bob), price)).gte(
        mv._MCR
      )
    );
    assertTrue(
      (await contracts.troveManager.getCurrentICR(address(carol), price)).gte(
        mv._MCR
      )
    );

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Attempt liqudation sequence
    await expect(contracts.troveManager.liquidateTroves(10)).to.be.revertedWith(
      "TroveManager: nothing to liquidate"
    );

    // Check all troves remain active
    assertTrue(await contracts.sortedTroves.contains(address(whale)));
    assertTrue(await contracts.sortedTroves.contains(address(alice)));
    assertTrue(await contracts.sortedTroves.contains(address(bob)));
    assertTrue(await contracts.sortedTroves.contains(address(carol)));

    const TCR_After = (await th.getTCR(contracts)).toString();
    const listSize_After = (await contracts.sortedTroves.getSize()).toString();

    assertEqual(TCR_Before, TCR_After);
    assertEqual(listSize_Before, listSize_After);
  });

  it("liquidateTroves(): liquidates based on entire/collateral debt (including pending rewards), not raw collateral/debt", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(400, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(221, 16)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(200, 16)),
      extraParams: { from: address(carol) },
    });
    await openTrove(defaulter_1, {
      ICR: toBN(dec(200, 16)),
      extraParams: { from: address(defaulter_1) },
    });

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    const alice_ICR_Before = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );
    const bob_ICR_Before = await contracts.troveManager.getCurrentICR(
      address(bob),
      price
    );
    const carol_ICR_Before = await contracts.troveManager.getCurrentICR(
      address(carol),
      price
    ); /* Before liquidation:

    Alice ICR: = (2 * 100 / 100) = 200%
    Bob ICR: (1 * 100 / 90.5) = 110.5%
    Carol ICR: (1 * 100 / 100 ) =  100%

    Therefore Alice and Bob above the MCR, Carol is below */
    assertTrue(alice_ICR_Before.gte(mv._MCR));
    assertTrue(bob_ICR_Before.gte(mv._MCR));
    assertTrue(carol_ICR_Before.lte(mv._MCR));

    // Liquidate defaulter. 30 ZKUSD and 0.3 NEON is distributed uniformly between A, B and C. Each receive 10 ZKUSD, 0.1 NEON
    await contracts.troveManager.liquidate(address(defaulter_1));

    const alice_ICR_After = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );
    const bob_ICR_After = await contracts.troveManager.getCurrentICR(
      address(bob),
      price
    );
    const carol_ICR_After = await contracts.troveManager.getCurrentICR(
      address(carol),
      price
    );

    /* After liquidation:

    Alice ICR: (1.0995 * 100 / 60) = 183.25%
    Bob ICR:(1.0995 * 100 / 100.5) =  109.40%
    Carol ICR: (1.0995 * 100 / 110 ) 99.95%

    Check Alice is above MCR, Bob below, Carol below. */
    assertTrue(alice_ICR_After.gte(mv._MCR));
    assertTrue(bob_ICR_After.lte(mv._MCR));
    assertTrue(carol_ICR_After.lte(mv._MCR));

    /* Though Bob's true ICR (including pending rewards) is below the MCR, check that Bob's raw coll and debt has not changed */
    const bob_Coll = (await contracts.troveManager.Troves(address(bob)))[1];
    const bob_Debt = (await contracts.troveManager.Troves(address(bob)))[0];

    const bob_rawICR = bob_Coll.mul(toBN(dec(100, 18))).div(bob_Debt);
    assertTrue(bob_rawICR.gte(mv._MCR));

    // Whale enters system, pulling it into Normal Mode
    await openTrove(whale, {
      ICR: toBN(dec(10, 18)),
      extraZKUSDAmount: dec(1, 24),
      extraParams: { from: address(whale) },
    });
    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    //liquidate A, B, C
    await contracts.troveManager.liquidateTroves(10);

    // Check A stays active, B and C get liquidated
    assertTrue(await contracts.sortedTroves.contains(address(alice)));
    assertFalse(await contracts.sortedTroves.contains(address(bob)));
    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    // check trove statuses - A active (1),  B and C closed by liquidation (3)
    assertEqual(
      (await contracts.troveManager.Troves(address(alice)))[3].toString(),
      "1"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(bob)))[3].toString(),
      "3"
    );
    assertEqual(
      (await contracts.troveManager.Troves(address(carol)))[3].toString(),
      "3"
    );
  });

  it("liquidateTroves(): reverts if n = 0", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(whale) },
    });
    await openTrove(alice, {
      ICR: toBN(dec(210, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(218, 16)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(206, 16)),
      extraParams: { from: address(carol) },
    });

    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    const TCR_Before = (await th.getTCR(contracts)).toString();

    // Confirm A, B, C ICRs are below 110%
    const alice_ICR = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );
    const bob_ICR = await contracts.troveManager.getCurrentICR(
      address(bob),
      price
    );
    const carol_ICR = await contracts.troveManager.getCurrentICR(
      address(carol),
      price
    );
    assertTrue(alice_ICR.lte(mv._MCR));
    assertTrue(bob_ICR.lte(mv._MCR));
    assertTrue(carol_ICR.lte(mv._MCR));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidation with n = 0
    await expect(contracts.troveManager.liquidateTroves(0)).to.be.revertedWith(
      "TroveManager: nothing to liquidate"
    );

    // Check all troves are still in the system
    assertTrue(await contracts.sortedTroves.contains(address(whale)));
    assertTrue(await contracts.sortedTroves.contains(address(alice)));
    assertTrue(await contracts.sortedTroves.contains(address(bob)));
    assertTrue(await contracts.sortedTroves.contains(address(carol)));

    const TCR_After = (await th.getTCR(contracts)).toString();

    // Check TCR has not changed after liquidation
    assertEqual(TCR_Before, TCR_After);
  });

  it("liquidateTroves():  liquidates troves with ICR < MCR", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(whale) },
    });

    // A, B, C open troves that will remain active when price drops to 100
    await openTrove(alice, {
      ICR: toBN(dec(220, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(230, 16)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(240, 16)),
      extraParams: { from: address(carol) },
    });

    // D, E, F open troves that will fall below MCR when price drops to 100
    await openTrove(dennis, {
      ICR: toBN(dec(218, 16)),
      extraParams: { from: address(dennis) },
    });
    await openTrove(erin, {
      ICR: toBN(dec(216, 16)),
      extraParams: { from: address(erin) },
    });
    await openTrove(flyn, {
      ICR: toBN(dec(210, 16)),
      extraParams: { from: address(flyn) },
    });

    // Check list size is 7
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "7");

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    const alice_ICR = await contracts.troveManager.getCurrentICR(
      address(alice),
      price
    );
    const bob_ICR = await contracts.troveManager.getCurrentICR(
      address(bob),
      price
    );
    const carol_ICR = await contracts.troveManager.getCurrentICR(
      address(carol),
      price
    );
    const dennis_ICR = await contracts.troveManager.getCurrentICR(
      address(dennis),
      price
    );
    const erin_ICR = await contracts.troveManager.getCurrentICR(
      address(erin),
      price
    );
    const flyn_ICR = await contracts.troveManager.getCurrentICR(
      address(flyn),
      price
    );

    // Check A, B, C have ICR above MCR
    assertTrue(alice_ICR.gte(mv._MCR));
    assertTrue(bob_ICR.gte(mv._MCR));
    assertTrue(carol_ICR.gte(mv._MCR));

    // Check D, E, F have ICR below MCR
    assertTrue(dennis_ICR.lte(mv._MCR));
    assertTrue(erin_ICR.lte(mv._MCR));
    assertTrue(flyn_ICR.lte(mv._MCR));

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    //Liquidate sequence
    await contracts.troveManager.liquidateTroves(10);

    // check list size reduced to 4
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "4");

    // Check Whale and A, B, C remain in the system
    assertTrue(await contracts.sortedTroves.contains(address(whale)));
    assertTrue(await contracts.sortedTroves.contains(address(alice)));
    assertTrue(await contracts.sortedTroves.contains(address(bob)));
    assertTrue(await contracts.sortedTroves.contains(address(carol)));

    // Check D, E, F have been removed
    assertFalse(await contracts.sortedTroves.contains(address(dennis)));
    assertFalse(await contracts.sortedTroves.contains(address(erin)));
    assertFalse(await contracts.sortedTroves.contains(address(flyn)));
  });

  it("liquidateTroves(): does not affect the liquidated user's token balances", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(whale) },
    });

    // D, E, F open troves that will fall below MCR when price drops to 100
    await openTrove(dennis, {
      ICR: toBN(dec(218, 16)),
      extraParams: { from: address(dennis) },
    });
    await openTrove(erin, {
      ICR: toBN(dec(216, 16)),
      extraParams: { from: address(erin) },
    });
    await openTrove(flyn, {
      ICR: toBN(dec(210, 16)),
      extraParams: { from: address(flyn) },
    });

    const D_balanceBefore = await zkusdToken.balanceOf(address(dennis));
    const E_balanceBefore = await zkusdToken.balanceOf(address(erin));
    const F_balanceBefore = await zkusdToken.balanceOf(address(flyn));

    // Check list size is 4
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "4");

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    //Liquidate sequence
    await contracts.troveManager.liquidateTroves(10);

    // check list size reduced to 1
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "1");

    // Check Whale remains in the system
    assertTrue(await contracts.sortedTroves.contains(address(whale)));

    // Check D, E, F have been removed
    assertFalse(await contracts.sortedTroves.contains(address(dennis)));
    assertFalse(await contracts.sortedTroves.contains(address(erin)));
    assertFalse(await contracts.sortedTroves.contains(address(flyn)));

    // Check token balances of users whose troves were liquidated, have not changed
    assertEqual(
      (await zkusdToken.balanceOf(address(dennis))).toString(),
      D_balanceBefore
    );
    assertEqual(
      (await zkusdToken.balanceOf(address(erin))).toString(),
      E_balanceBefore
    );
    assertEqual(
      (await zkusdToken.balanceOf(address(flyn))).toString(),
      F_balanceBefore
    );
  });

  it("liquidateTroves(): A liquidation sequence containing Pool offsets increases the TCR", async () => {
    // Whale provides 500 ZKUSD to SP
    await openTrove(whale, {
      ICR: toBN(dec(100, 18)),
      extraZKUSDAmount: toBN(dec(500, 18)),
      extraParams: { from: address(whale) },
    });
    await contracts.stabilityPool.connect(whale).provideToSP(dec(500, 18));

    await openTrove(alice, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(28, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(8, 18)),
      extraParams: { from: address(carol) },
    });
    await openTrove(dennis, {
      ICR: toBN(dec(80, 18)),
      extraParams: { from: address(dennis) },
    });

    await openTrove(defaulter_1, {
      ICR: toBN(dec(199, 16)),
      extraParams: { from: address(defaulter_1) },
    });
    await openTrove(defaulter_2, {
      ICR: toBN(dec(156, 16)),
      extraParams: { from: address(defaulter_2) },
    });
    await openTrove(defaulter_3, {
      ICR: toBN(dec(183, 16)),
      extraParams: { from: address(defaulter_3) },
    });
    await openTrove(defaulter_4, {
      ICR: toBN(dec(166, 16)),
      extraParams: { from: address(defaulter_4) },
    });

    assertTrue(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_2)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_3)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_4)));

    assertEqual((await contracts.sortedTroves.getSize()).toString(), "9");

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    const TCR_Before = await th.getTCR(contracts);

    // Check pool has 500 ZKUSD
    assertEqual(
      (await contracts.stabilityPool.getTotalZKUSDDeposits()).toString(),
      dec(500, 18)
    );

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate troves
    await contracts.troveManager.liquidateTroves(10);

    // Check pool has been emptied by the liquidations
    assertEqual(
      (await contracts.stabilityPool.getTotalZKUSDDeposits()).toString(),
      "0"
    );

    // Check all defaulters have been liquidated
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_2)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_3)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_4)));

    // check system sized reduced to 5 troves
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "5");

    // Check that the liquidation sequence has improved the TCR
    const TCR_After = await th.getTCR(contracts);
    assertTrue(TCR_After.gte(TCR_Before));
  });

  it("liquidateTroves(): A liquidation sequence of pure redistributions decreases the TCR, due to gas compensation, but up to 0.5%", async () => {
    const { collateral: W_coll, totalDebt: W_debt } = await openTrove(whale, {
      ICR: toBN(dec(100, 18)),
      extraParams: { from: address(whale) },
    });
    const { collateral: A_coll, totalDebt: A_debt } = await openTrove(alice, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(alice) },
    });
    const { collateral: B_coll, totalDebt: B_debt } = await openTrove(bob, {
      ICR: toBN(dec(28, 18)),
      extraParams: { from: address(bob) },
    });
    const { collateral: C_coll, totalDebt: C_debt } = await openTrove(carol, {
      ICR: toBN(dec(8, 18)),
      extraParams: { from: address(carol) },
    });
    const { collateral: D_coll, totalDebt: D_debt } = await openTrove(dennis, {
      ICR: toBN(dec(80, 18)),
      extraParams: { from: address(dennis) },
    });

    const { collateral: d1_coll, totalDebt: d1_debt } = await openTrove(
      defaulter_1,
      { ICR: toBN(dec(199, 16)), extraParams: { from: address(defaulter_1) } }
    );
    const { collateral: d2_coll, totalDebt: d2_debt } = await openTrove(
      defaulter_2,
      { ICR: toBN(dec(156, 16)), extraParams: { from: address(defaulter_2) } }
    );
    const { collateral: d3_coll, totalDebt: d3_debt } = await openTrove(
      defaulter_3,
      { ICR: toBN(dec(183, 16)), extraParams: { from: address(defaulter_3) } }
    );
    const { collateral: d4_coll, totalDebt: d4_debt } = await openTrove(
      defaulter_4,
      { ICR: toBN(dec(166, 16)), extraParams: { from: address(defaulter_4) } }
    );

    const totalCollNonDefaulters = W_coll.add(A_coll)
      .add(B_coll)
      .add(C_coll)
      .add(D_coll);
    const totalCollDefaulters = d1_coll.add(d2_coll).add(d3_coll).add(d4_coll);
    const totalColl = totalCollNonDefaulters.add(totalCollDefaulters);
    const totalDebt = W_debt.add(A_debt)
      .add(B_debt)
      .add(C_debt)
      .add(D_debt)
      .add(d1_debt)
      .add(d2_debt)
      .add(d3_debt)
      .add(d4_debt);

    assertTrue(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_2)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_3)));
    assertTrue(await contracts.sortedTroves.contains(address(defaulter_4)));

    assertEqual((await contracts.sortedTroves.getSize()).toString(), "9");

    // Price drops
    const price = toBN(dec(100, 18));
    await contracts.priceFeedTestnet.setPrice(price);

    const TCR_Before = await th.getTCR(contracts);
    isAtMost(
      th.getDifference(TCR_Before, totalColl.mul(price).div(totalDebt)),
      1000
    );

    // Check pool is empty before liquidation
    assertEqual(
      (await contracts.stabilityPool.getTotalZKUSDDeposits()).toString(),
      "0"
    );

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate
    await contracts.troveManager.liquidateTroves(10);

    // Check all defaulters have been liquidated
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_2)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_3)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_4)));

    // check system sized reduced to 5 troves
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "5");

    // Check that the liquidation sequence has reduced the TCR
    const TCR_After = await th.getTCR(contracts);
    // ((100+1+7+2+20)+(1+2+3+4)*0.995)*100/(2050+50+50+50+50+101+257+328+480)
    isAtMost(
      th.getDifference(
        TCR_After,
        totalCollNonDefaulters
          .add(th.applyLiquidationFee(totalCollDefaulters))
          .mul(price)
          .div(totalDebt)
      ),
      1000
    );
    assertTrue(TCR_Before.gte(TCR_After));
    assertTrue(TCR_After.gte(TCR_Before.mul(toBN(995)).div(toBN(1000))));
  });

  it("liquidateTroves(): Liquidating troves with SP deposits correctly impacts their SP deposit and NEON gain", async () => {
    // Whale provides 400 ZKUSD to the SP
    const whaleDeposit = toBN(dec(40000, 18));
    await openTrove(whale, {
      ICR: toBN(dec(100, 18)),
      extraZKUSDAmount: whaleDeposit,
      extraParams: { from: address(whale) },
    });
    await contracts.stabilityPool.connect(whale).provideToSP(whaleDeposit);

    const A_deposit = toBN(dec(10000, 18));
    const B_deposit = toBN(dec(30000, 18));
    const { collateral: A_coll, totalDebt: A_debt } = await openTrove(alice, {
      ICR: toBN(dec(2, 18)),
      extraZKUSDAmount: A_deposit,
      extraParams: { from: address(alice) },
    });
    const { collateral: B_coll, totalDebt: B_debt } = await openTrove(bob, {
      ICR: toBN(dec(2, 18)),
      extraZKUSDAmount: B_deposit,
      extraParams: { from: address(bob) },
    });
    const { collateral: C_coll, totalDebt: C_debt } = await openTrove(carol, {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: address(carol) },
    });

    const liquidatedColl = A_coll.add(B_coll).add(C_coll);
    const liquidatedDebt = A_debt.add(B_debt).add(C_debt);

    // A, B provide 100, 300 to the SP
    await contracts.stabilityPool.connect(alice).provideToSP(A_deposit);
    await contracts.stabilityPool.connect(bob).provideToSP(B_deposit);

    assertEqual((await contracts.sortedTroves.getSize()).toString(), "4");

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    // Check 800 ZKUSD in Pool
    const totalDeposits = whaleDeposit.add(A_deposit).add(B_deposit);
    assertEqual(
      (await contracts.stabilityPool.getTotalZKUSDDeposits()).toString(),
      totalDeposits
    );

    // Confirm system is not in Recovery Mode
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate
    await contracts.troveManager.liquidateTroves(10);

    // Check all defaulters have been liquidated
    assertFalse(await contracts.sortedTroves.contains(address(alice)));
    assertFalse(await contracts.sortedTroves.contains(address(bob)));
    assertFalse(await contracts.sortedTroves.contains(address(carol)));

    // check system sized reduced to 1 troves
    assertEqual((await contracts.sortedTroves.getSize()).toString(), "1");

    /* Prior to liquidation, SP deposits were:
    Whale: 400 ZKUSD
    Alice: 100 ZKUSD
    Bob:   300 ZKUSD
    Carol: 0 ZKUSD

    Total ZKUSD in Pool: 800 ZKUSD

    Then, liquidation hits A,B,C:

    Total liquidated debt = 150 + 350 + 150 = 650 ZKUSD
    Total liquidated NEON = 1.1 + 3.1 + 1.1 = 5.3 NEON

    whale rusd loss: 650 * (400/800) = 325 rusd
    alice rusd loss:  650 *(100/800) = 81.25 rusd
    bob rusd loss: 650 * (300/800) = 243.75 rusd

    whale remaining deposit: (400 - 325) = 75 rusd
    alice remaining deposit: (100 - 81.25) = 18.75 rusd
    bob remaining deposit: (300 - 243.75) = 56.25 rusd

    whale neon gain: 5*0.995 * (400/800) = 2.4875 neon
    alice neon gain: 5*0.995 *(100/800) = 0.621875 neon
    bob neon gain: 5*0.995 * (300/800) = 1.865625 neon

    Total remaining deposits: 150 ZKUSD
    Total NEON gain: 4.975 NEON */

    // Check remaining ZKUSD Deposits and NEON gain, for whale and depositors whose troves were liquidated
    const whale_Deposit_After =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(whale));
    const alice_Deposit_After =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(alice));
    const bob_Deposit_After =
      await contracts.stabilityPool.getCompoundedZKUSDDeposit(address(bob));

    const whale_NEONGain = await contracts.stabilityPool.getDepositorNEONGain(
      address(whale)
    );
    const alice_NEONGain = await contracts.stabilityPool.getDepositorNEONGain(
      address(alice)
    );
    const bob_NEONGain = await contracts.stabilityPool.getDepositorNEONGain(
      address(bob)
    );

    isAtMost(
      th.getDifference(
        whale_Deposit_After,
        whaleDeposit.sub(liquidatedDebt.mul(whaleDeposit).div(totalDeposits))
      ),
      100000
    );
    isAtMost(
      th.getDifference(
        alice_Deposit_After,
        A_deposit.sub(liquidatedDebt.mul(A_deposit).div(totalDeposits))
      ),
      100000
    );
    isAtMost(
      th.getDifference(
        bob_Deposit_After,
        B_deposit.sub(liquidatedDebt.mul(B_deposit).div(totalDeposits))
      ),
      100000
    );

    isAtMost(
      th.getDifference(
        whale_NEONGain,
        th
          .applyLiquidationFee(liquidatedColl)
          .mul(whaleDeposit)
          .div(totalDeposits)
      ),
      100000
    );
    isAtMost(
      th.getDifference(
        alice_NEONGain,
        th.applyLiquidationFee(liquidatedColl).mul(A_deposit).div(totalDeposits)
      ),
      100000
    );
    isAtMost(
      th.getDifference(
        bob_NEONGain,
        th.applyLiquidationFee(liquidatedColl).mul(B_deposit).div(totalDeposits)
      ),
      100000
    );

    // Check total remaining deposits and NEON gain in Stability Pool
    const total_ZKUSDinSP =
      await contracts.stabilityPool.getTotalZKUSDDeposits();
    const total_NEONinSP = await contracts.stabilityPool.getNEON();

    isAtMost(
      th.getDifference(total_ZKUSDinSP, totalDeposits.sub(liquidatedDebt)),
      1000
    );
    isAtMost(
      th.getDifference(total_NEONinSP, th.applyLiquidationFee(liquidatedColl)),
      1000
    );
  });

  it("liquidateTroves(): when SP > 0, triggers LQTY reward event - increases the sum G", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(100, 18)),
      extraParams: { from: address(whale) },
    });

    // A, B, C open troves
    await openTrove(A, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(A) },
    });
    await openTrove(B, {
      ICR: toBN(dec(3, 18)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(B) },
    });
    await openTrove(C, {
      ICR: toBN(dec(3, 18)),
      extraParams: { from: address(C) },
    });

    await openTrove(defaulter_1, {
      ICR: toBN(dec(219, 16)),
      extraParams: { from: address(defaulter_1) },
    });
    await openTrove(defaulter_2, {
      ICR: toBN(dec(213, 16)),
      extraParams: { from: address(defaulter_2) },
    });

    // B provides to SP
    await contracts.stabilityPool.connect(B).provideToSP(dec(100, 18));
    assertEqual(
      await contracts.stabilityPool.getTotalZKUSDDeposits(),
      dec(100, 18)
    );

    const G_Before = await contracts.stabilityPool.epochToScaleToG(0, 0);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR);

    // Price drops to 1NEON:100ZKUSD, reducing defaulters to below MCR
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();
    assertFalse(await th.checkRecoveryMode(contracts));

    // Liquidate troves
    await contracts.troveManager.liquidateTroves(2);
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_2)));

    const G_After = await contracts.stabilityPool.epochToScaleToG(0, 0);

    // Expect G has increased from the LQTY reward event triggered
    assertTrue(G_After.gt(G_Before));
  });

  it("liquidateTroves(): when SP is empty, doesn't update G", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(100, 18)),
      extraParams: { from: address(whale) },
    });

    // A, B, C open troves
    await openTrove(A, {
      ICR: toBN(dec(4, 18)),
      extraParams: { from: address(A) },
    });
    await openTrove(B, {
      ICR: toBN(dec(3, 18)),
      extraZKUSDAmount: toBN(dec(100, 18)),
      extraParams: { from: address(B) },
    });
    await openTrove(C, {
      ICR: toBN(dec(3, 18)),
      extraParams: { from: address(C) },
    });

    await openTrove(defaulter_1, {
      ICR: toBN(dec(219, 16)),
      extraParams: { from: address(defaulter_1) },
    });
    await openTrove(defaulter_2, {
      ICR: toBN(dec(213, 16)),
      extraParams: { from: address(defaulter_2) },
    });

    // B provides to SP
    await contracts.stabilityPool.connect(B).provideToSP(dec(100, 18));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR);

    // B withdraws
    await contracts.stabilityPool.connect(B).withdrawFromSP(dec(100, 18));

    // Check SP is empty
    assertEqual(await contracts.stabilityPool.getTotalZKUSDDeposits(), "0");

    // Check G is non-zero
    const G_Before = await contracts.stabilityPool.epochToScaleToG(0, 0);
    assertTrue(G_Before.gt(toBN("0")));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR);

    // Price drops to 1NEON:100ZKUSD, reducing defaulters to below MCR
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();
    assertFalse(await th.checkRecoveryMode(contracts));

    // liquidate troves
    await contracts.troveManager.liquidateTroves(2);
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_1)));
    assertFalse(await contracts.sortedTroves.contains(address(defaulter_2)));

    const G_After = await contracts.stabilityPool.epochToScaleToG(0, 0);

    // Expect G has not changed
    assertTrue(G_After.eq(G_Before));
  });

  // --- computeICR ---

  it("computeICR(): Returns 0 if trove's coll is worth 0", async () => {
    const price = 0;
    const coll = dec(1, "ether");
    const debt = dec(100, 18);

    const ICR = await contracts.troveManager.computeICR(coll, debt, price);

    expect(ICR).to.be.eq(0);
  });

  it("computeICR(): Returns 2^256-1 for NEON:USD = 100, coll = 1 NEON, debt = 100 ZKUSD", async () => {
    const price = toBN(dec(100, 18));
    const coll = toBN(dec(1, "ether"));
    const debt = toBN(dec(100, 18));

    const ICR = await contracts.troveManager.computeICR(coll, debt, price);

    expect(ICR).to.be.eq(toBN(dec(1, 18)));
  });

  it("computeICR(): returns correct ICR for NEON:USD = 100, coll = 200 NEON, debt = 30 ZKUSD", async () => {
    const price = toBN(dec(100, 18));
    const coll = toBN(dec(200, "ether"));
    const debt = toBN(dec(30, 18));

    const ICR = await contracts.troveManager.computeICR(coll, debt, price);

    expect(
      th.getDifference(ICR, BigNumber.from("666666666666666666666"))
    ).to.be.lte(1000);
  });

  it("computeICR(): returns correct ICR for NEON:USD = 250, coll = 1350 NEON, debt = 127 ZKUSD", async () => {
    const price = BigNumber.from("250000000000000000000");
    const coll = BigNumber.from("1350000000000000000000");
    const debt = BigNumber.from("127000000000000000000");

    const ICR = await contracts.troveManager.computeICR(coll, debt, price);

    expect(
      th.getDifference(ICR, BigNumber.from("2657480314960630000000"))
    ).to.be.lte(1000000);
  });

  it("computeICR(): returns correct ICR for NEON:USD = 100, coll = 1 NEON, debt = 54321 ZKUSD", async () => {
    const price = toBN(dec(100, 18));
    const coll = toBN(dec(1, "ether"));
    const debt = BigNumber.from("54321000000000000000000");

    const ICR = await contracts.troveManager.computeICR(coll, debt, price);

    expect(th.getDifference(ICR, BigNumber.from("1840908672520756"))).to.be.lte(
      1000
    );
  });

  it("computeICR(): Returns 2^256-1 if trove has non-zero coll and zero debt", async () => {
    const price = toBN(dec(100, 18));
    const coll = toBN(dec(1, "ether"));
    const debt = 0;

    const ICR = await contracts.troveManager.computeICR(coll, debt, price);

    expect(ICR).to.be.eq(ethers.constants.MaxUint256);
  });

  // --- checkRecoveryMode ---

  //TCR < 150%
  it("checkRecoveryMode(): Returns true when TCR < 150%", async () => {
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(bob) },
    });

    await contracts.priceFeedTestnet.setPrice(toBN("99999999999999999999"));

    const TCR = await th.getTCR(contracts);

    assertTrue(TCR.lte(toBN("1500000000000000000")));

    assertTrue(await th.checkRecoveryMode(contracts));
  });

  // TCR == 150%
  it("checkRecoveryMode(): Returns false when TCR == 150%", async () => {
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(bob) },
    });

    const TCR = await th.getTCR(contracts);

    assertEqual(TCR, "1500000000000000000");

    assertFalse(await th.checkRecoveryMode(contracts));
  });

  // > 150%
  it("checkRecoveryMode(): Returns false when TCR > 150%", async () => {
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(bob) },
    });

    await contracts.priceFeedTestnet.setPrice(toBN("100000000000000000001"));

    const TCR = await th.getTCR(contracts);

    assertTrue(TCR.gte(toBN("1500000000000000000")));

    assertFalse(await th.checkRecoveryMode(contracts));
  });

  // check 0
  it("checkRecoveryMode(): Returns false when TCR == 0", async () => {
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    await openTrove(A, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(A) },
    });
    await openTrove(B, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(B) },
    });

    await contracts.priceFeedTestnet.setPrice(0);

    const TCR = await th.getTCR(contracts);

    assertEqual(TCR, 0);

    assertTrue(await th.checkRecoveryMode(contracts));
  });

  // --- Getters ---

  it("getTroveStake(): Returns stake", async () => {
    const { collateral: A_coll } = await openTrove(A, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(A) },
    });
    const { collateral: B_coll } = await openTrove(B, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(B) },
    });

    const A_Stake = await contracts.troveManager.getTroveStake(address(A));
    const B_Stake = await contracts.troveManager.getTroveStake(address(B));

    assertEqual(A_Stake, A_coll);
    assertEqual(B_Stake, B_coll);
  });

  it("getTroveColl(): Returns coll", async () => {
    const { collateral: A_coll } = await openTrove(A, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(A) },
    });
    const { collateral: B_coll } = await openTrove(B, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(B) },
    });

    assertEqual(await contracts.troveManager.getTroveColl(address(A)), A_coll);
    assertEqual(await contracts.troveManager.getTroveColl(address(B)), B_coll);
  });

  it("getTroveDebt(): Returns debt", async () => {
    const { totalDebt: totalDebtA } = await openTrove(A, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(A) },
    });
    const { totalDebt: totalDebtB } = await openTrove(B, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(B) },
    });

    const A_Debt = await contracts.troveManager.getTroveDebt(address(A));
    const B_Debt = await contracts.troveManager.getTroveDebt(address(B));

    // Expect debt = requested + 0.5% fee + 50 (due to gas comp)

    assertEqual(A_Debt, totalDebtA);
    assertEqual(B_Debt, totalDebtB);
  });

  it("getTroveStatus(): Returns status", async () => {
    const { totalDebt: B_totalDebt } = await openTrove(B, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(B) },
    });
    await openTrove(A, {
      ICR: toBN(dec(150, 16)),
      extraZKUSDAmount: B_totalDebt,
      extraParams: { from: address(A) },
    });

    // to be able to repay:
    await zkusdToken.connect(A).transfer(address(B), B_totalDebt);
    await contracts.borrowerOperations.connect(B).closeTrove();

    const A_Status = await contracts.troveManager.getTroveStatus(address(A));
    const B_Status = await contracts.troveManager.getTroveStatus(address(B));
    const C_Status = await contracts.troveManager.getTroveStatus(address(C));

    assertEqual(A_Status, 1); // active
    assertEqual(B_Status, 2); // closed by user
    assertEqual(C_Status, 0); // non-existent
  });

  it("hasPendingRewards(): Returns false it trove is not active", async () => {
    assertFalse(await contracts.troveManager.hasPendingRewards(address(alice)));
  });
});
