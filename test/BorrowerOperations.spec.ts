import {assert, expect} from "chai";
import { BigNumber, Signer } from "ethers";
import {assertEqual, assertFalse, assertTrue, ContractType, isAtMost, TestHelper as th} from "./TestHelpers";
import { DeployHelpers } from "./DeployHelpers";
import {
  ActivePool,
  CollSurplusPool,
  CommunityIssuance,
  DefaultPool,
  LockupContractFactory,
  ZKToken,
  ZKTStaking,
  ZKUSDToken,
} from "../typechain-types";
import { ethers } from "hardhat";

const dec = th.dec;
const toBN = th.toBN;

describe("BorrowerOperations", () => {
  let dh = new DeployHelpers();
  let owner: string,
    alice: string,
    bob: string,
    carol: string,
    dennis: string,
    whale: string;
  let A: string,
    B: string,
    C: string,
    D: string,
    E: string,
    F: string,
    G: string,
    H: string;
  let contracts: ContractType;
  let zkusdToken: ZKUSDToken;
  let activePool: ActivePool;
  let collSurplusPool: CollSurplusPool;
  let defaultPool: DefaultPool;
  let zktStaking: ZKTStaking;
  let zkToken: ZKToken;
  let communityIssuance: CommunityIssuance;
  let lockupContractFactory: LockupContractFactory;

  let ZKUSD_GAS_COMPENSATION: BigNumber;
  let MIN_NET_DEBT: BigNumber;
  let BORROWING_FEE_FLOOR: BigNumber;

  const getOpenTroveZKUSDAmount = async (totalDebt: BigNumber) =>
    th.getOpenTroveZKUSDAmount(contracts, totalDebt);

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

  const getTroveEntireColl = async (trove: string) =>
    th.getTroveEntireColl(contracts, trove);
  const getTroveEntireDebt = async (trove: string) =>
    th.getTroveEntireDebt(contracts, trove);
  const getTroveStake = async (trove: string) =>
    th.getTroveStake(contracts, trove);

  before(async () => {
    await dh.runBeforeInitialize();
    const addresses = await Promise.all(
      dh.testEnv.users.map((signer) => signer.getAddress())
    );
    [owner, alice, bob, carol, dennis, whale, A, B, C, D, E, F, G, H] =
      addresses;
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
    zktStaking = dh.testEnv.zktStaking;
    zkToken = dh.testEnv.zkToken;
    communityIssuance = dh.testEnv.communityIssuance;
    lockupContractFactory = dh.testEnv.lockupContractFactory;

    ZKUSD_GAS_COMPENSATION =
      await contracts.borrowerOperations.ZKUSD_GAS_COMPENSATION();
    MIN_NET_DEBT = await contracts.borrowerOperations.MIN_NET_DEBT();
    BORROWING_FEE_FLOOR =
      await contracts.borrowerOperations.BORROWING_FEE_FLOOR();
  });

  // it("addColl(): reverts when top-up would leave trove with ICR < MCR", async () => {
  //     // alice creates a Trove and adds first collateral
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //     await openTrove(dh.testEnv.users[2], {
  //         ICR: toBN(dec(10, 18)),
  //         extraParams: {from: bob},
  //     });
  //
  //     // Price drops
  //     await contracts.priceFeedTestnet.setPrice(dec(100, 18));
  //     const price = await contracts.priceFeedTestnet.getPrice();
  //
  //     assertFalse(await contracts.troveManager.checkRecoveryMode(price));
  //     assertTrue(
  //         (await contracts.troveManager.getCurrentICR(alice, price)).lt(
  //             toBN(dec(110, 16))
  //         )
  //     );
  //
  //     const collTopUp = 1; // 1 wei top up
  //
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[1])
  //             .addColl(alice, alice, {
  //                 from: alice,
  //                 value: collTopUp,
  //             })
  //     ).to.be.revertedWith(
  //         "Operation: An operation that would result in ICR < MCR is not permitted"
  //     );
  // });
  //
  // it("addColl(): Increases the activePool ETH and raw ether balance by correct amount", async () => {
  //     const {collateral: aliceColl} = await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //
  //     const activePool_ETH_Before = await activePool.getETH();
  //     const activePool_RawConflux_Before = toBN(
  //         await ethers.provider.getBalance(activePool.address)
  //     );
  //
  //     assertTrue(activePool_ETH_Before.eq(aliceColl));
  //     assertTrue(activePool_RawConflux_Before.eq(aliceColl));
  //
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[1])
  //         .addColl(alice, alice, {
  //             from: alice,
  //             value: dec(1, "ether"),
  //         });
  //
  //     const activePool_ETH_After = await activePool.getETH();
  //     const activePool_RawConflux_After = toBN(
  //         await ethers.provider.getBalance(activePool.address)
  //     );
  //     assertTrue(activePool_ETH_After.eq(aliceColl.add(toBN(dec(1, "ether")))));
  //     assertTrue(
  //         activePool_RawConflux_After.eq(aliceColl.add(toBN(dec(1, "ether"))))
  //     );
  // });
  //
  // it("addColl(), active Trove: adds the correct collateral amount to the Trove", async () => {
  //     // alice creates a Trove and adds first collateral
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //
  //     const alice_Trove_Before = await contracts.troveManager.Troves(alice);
  //     const coll_before = alice_Trove_Before[1];
  //     const status_Before = alice_Trove_Before[3];
  //
  //     // check status before
  //     assertEqual(status_Before, 1);
  //
  //     // Alice adds second collateral
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[1])
  //         .addColl(alice, alice, {
  //             from: alice,
  //             value: dec(1, "ether"),
  //         });
  //
  //     const alice_Trove_After = await contracts.troveManager.Troves(alice);
  //     const coll_After = alice_Trove_After[1];
  //     const status_After = alice_Trove_After[3];
  //
  //     // check coll increases by correct amount,and status remains active
  //     assertTrue(coll_After.eq(coll_before.add(toBN(dec(1, "ether")))));
  //     assertEqual(status_After, 1);
  // });
  //
  // it("addColl(), active Trove: Trove is in sortedList before and after", async () => {
  //     // alice creates a Trove and adds first collateral
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //
  //     // check Alice is in list before
  //     const aliceTroveInList_Before = await contracts.sortedTroves.contains(
  //         alice
  //     );
  //     const listIsEmpty_Before = await contracts.sortedTroves.isEmpty();
  //     assertEqual(aliceTroveInList_Before, true);
  //     assertEqual(listIsEmpty_Before, false);
  //
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[1])
  //         .addColl(alice, alice, {
  //             from: alice,
  //             value: dec(1, "ether"),
  //         });
  //
  //     // check Alice is still in list after
  //     const aliceTroveInList_After = await contracts.sortedTroves.contains(alice);
  //     const listIsEmpty_After = await contracts.sortedTroves.isEmpty();
  //     assertEqual(aliceTroveInList_After, true);
  //     assertEqual(listIsEmpty_After, false);
  // });
  //
  // it("addColl(), active Trove: updates the stake and updates the total stakes", async () => {
  //     //  Alice creates initial Trove with 1 ether
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //
  //     const alice_Trove_Before = await contracts.troveManager.Troves(alice);
  //     const alice_Stake_Before = alice_Trove_Before[2];
  //     const totalStakes_Before = await contracts.troveManager.totalStakes();
  //
  //     assertTrue(totalStakes_Before.eq(alice_Stake_Before));
  //
  //     // Alice tops up Trove collateral with 2 ether
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[1])
  //         .addColl(alice, alice, {
  //             from: alice,
  //             value: dec(2, "ether"),
  //         });
  //
  //     // Check stake and total stakes get updated
  //     const alice_Trove_After = await contracts.troveManager.Troves(alice);
  //     const alice_Stake_After = alice_Trove_After[2];
  //     const totalStakes_After = await contracts.troveManager.totalStakes();
  //
  //     assertTrue(
  //         alice_Stake_After.eq(alice_Stake_Before.add(toBN(dec(2, "ether"))))
  //     );
  //     assertTrue(
  //         totalStakes_After.eq(totalStakes_Before.add(toBN(dec(2, "ether"))))
  //     );
  // });
  //
  // it("addColl(), active Trove: applies pending rewards and updates user's L_ETH, L_ZKUSDDebt snapshots", async () => {
  //     // --- SETUP ---
  //
  //     const {collateral: aliceCollBefore, totalDebt: aliceDebtBefore} =
  //         await openTrove(dh.testEnv.users[1], {
  //             extraZKUSDAmount: toBN(dec(15000, 18)),
  //             ICR: toBN(dec(2, 18)),
  //             extraParams: {from: alice},
  //         });
  //     const {collateral: bobCollBefore, totalDebt: bobDebtBefore} =
  //         await openTrove(dh.testEnv.users[2], {
  //             extraZKUSDAmount: toBN(dec(10000, 18)),
  //             ICR: toBN(dec(2, 18)),
  //             extraParams: {from: bob},
  //         });
  //     await openTrove(dh.testEnv.users[3], {
  //         extraZKUSDAmount: toBN(dec(5000, 18)),
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: carol},
  //     });
  //
  //     // --- TEST ---
  //
  //     // price drops to 1ETH:100ZKUSD, reducing Carol's ICR below MCR
  //     await contracts.priceFeedTestnet.setPrice(toBN("100000000000000000000"));
  //
  //     // Liquidate Carol's Trove,
  //     const tx = await contracts.troveManager
  //         .connect(dh.testEnv.users[0])
  //         .liquidate(carol, {from: owner});
  //
  //     assertFalse(await contracts.sortedTroves.contains(carol));
  //
  //     const L_ETH = await contracts.troveManager.L_ETH();
  //     const L_ZKUSDDebt = await contracts.troveManager.L_ZKUSDDebt();
  //
  //     // check Alice and Bob's reward snapshots are zero before they alter their Troves
  //     const alice_rewardSnapshot_Before =
  //         await contracts.troveManager.rewardSnapshots(alice);
  //     const alice_ETHrewardSnapshot_Before = alice_rewardSnapshot_Before[0];
  //     const alice_ZKUSDDebtRewardSnapshot_Before = alice_rewardSnapshot_Before[1];
  //
  //     const bob_rewardSnapshot_Before =
  //         await contracts.troveManager.rewardSnapshots(bob);
  //     const bob_ETHrewardSnapshot_Before = bob_rewardSnapshot_Before[0];
  //     const bob_ZKUSDDebtRewardSnapshot_Before = bob_rewardSnapshot_Before[1];
  //
  //     assertEqual(alice_ETHrewardSnapshot_Before, 0);
  //     assertEqual(alice_ZKUSDDebtRewardSnapshot_Before, 0);
  //     assertEqual(bob_ETHrewardSnapshot_Before, 0);
  //     assertEqual(bob_ZKUSDDebtRewardSnapshot_Before, 0);
  //
  //     const alicePendingETHReward =
  //         await contracts.troveManager.getPendingETHReward(alice);
  //     const bobPendingETHReward =
  //         await contracts.troveManager.getPendingETHReward(bob);
  //     const alicePendingZKUSDDebtReward =
  //         await contracts.troveManager.getPendingZKUSDDebtReward(alice);
  //     const bobPendingZKUSDDebtReward =
  //         await contracts.troveManager.getPendingZKUSDDebtReward(bob);
  //     for (const reward of [
  //         alicePendingETHReward,
  //         bobPendingETHReward,
  //         alicePendingZKUSDDebtReward,
  //         bobPendingZKUSDDebtReward,
  //     ]) {
  //         assertTrue(reward.gt(toBN("0")));
  //     }
  //
  //     // Alice and Bob top up their Troves
  //     const aliceTopUp = toBN(dec(5, "ether"));
  //     const bobTopUp = toBN(dec(1, "ether"));
  //
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[1])
  //         .addColl(alice, alice, {
  //             from: alice,
  //             value: aliceTopUp,
  //         });
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[2])
  //         .addColl(bob, bob, {
  //             from: bob,
  //             value: bobTopUp,
  //         });
  //
  //     // Check that both alice and Bob have had pending rewards applied in addition to their top-ups.
  //     const aliceNewColl = await getTroveEntireColl(alice);
  //     const aliceNewDebt = await getTroveEntireDebt(alice);
  //     const bobNewColl = await getTroveEntireColl(bob);
  //     const bobNewDebt = await getTroveEntireDebt(bob);
  //
  //     assertTrue(
  //         aliceNewColl.eq(
  //             aliceCollBefore.add(alicePendingETHReward).add(aliceTopUp)
  //         )
  //     );
  //     assertTrue(
  //         aliceNewDebt.eq(aliceDebtBefore.add(alicePendingZKUSDDebtReward))
  //     );
  //     assertTrue(
  //         bobNewColl.eq(bobCollBefore.add(bobPendingETHReward).add(bobTopUp))
  //     );
  //     assertTrue(bobNewDebt.eq(bobDebtBefore.add(bobPendingZKUSDDebtReward)));
  //
  //     /* Check that both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
  //      to the latest values of L_ETH and L_ZKUSDDebt */
  //     const alice_rewardSnapshot_After =
  //         await contracts.troveManager.rewardSnapshots(alice);
  //     const alice_ETHrewardSnapshot_After = alice_rewardSnapshot_After[0];
  //     const alice_ZKUSDDebtRewardSnapshot_After = alice_rewardSnapshot_After[1];
  //
  //     const bob_rewardSnapshot_After =
  //         await contracts.troveManager.rewardSnapshots(bob);
  //     const bob_ETHrewardSnapshot_After = bob_rewardSnapshot_After[0];
  //     const bob_ZKUSDDebtRewardSnapshot_After = bob_rewardSnapshot_After[1];
  //
  //     isAtMost(th.getDifference(alice_ETHrewardSnapshot_After, L_ETH), 100);
  //     isAtMost(
  //         th.getDifference(alice_ZKUSDDebtRewardSnapshot_After, L_ZKUSDDebt),
  //         100
  //     );
  //     isAtMost(th.getDifference(bob_ETHrewardSnapshot_After, L_ETH), 100);
  //     isAtMost(
  //         th.getDifference(bob_ZKUSDDebtRewardSnapshot_After, L_ZKUSDDebt),
  //         100
  //     );
  // });
  // it("addColl(), reverts if trove is non-existent or closed", async () => {
  //     // A, B open troves
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //     await openTrove(dh.testEnv.users[2], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: bob},
  //     });
  //
  //     // Carol attempts to add collateral to her non-existent trove
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[3])
  //             .addColl(carol, carol, {from: carol, value: dec(1, "ether")})
  //     ).to.be.revertedWith("Operation: Trove does not exist or is closed");
  //
  //     // Price drops
  //     await contracts.priceFeedTestnet.setPrice(dec(100, 18));
  //
  //     // Bob gets liquidated
  //     await contracts.troveManager.liquidate(bob);
  //
  //     assertFalse(await contracts.sortedTroves.contains(bob));
  //
  //     // Bob attempts to add collateral to his closed trove
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[2])
  //             .addColl(bob, bob, {from: bob, value: dec(1, "ether")})
  //     ).to.be.revertedWith("Operation: Trove does not exist or is closed");
  // });
  //
  // it("addColl(): can add collateral in Recovery Mode", async () => {
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //     const aliceCollBefore = await getTroveEntireColl(alice);
  //     assertFalse(await th.checkRecoveryMode(contracts));
  //
  //     await contracts.priceFeedTestnet.setPrice(toBN("105000000000000000000"));
  //
  //     assertTrue(await th.checkRecoveryMode(contracts));
  //
  //     const collTopUp = toBN(dec(1, "ether"));
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[1])
  //         .addColl(alice, alice, {
  //             from: alice,
  //             value: collTopUp,
  //         });
  //
  //     // Check Alice's collateral
  //     const aliceCollAfter = (await contracts.troveManager.Troves(alice))[1];
  //     assertTrue(aliceCollAfter.eq(aliceCollBefore.add(collTopUp)));
  // });

  // // --- withdrawColl() ---
  //
  // it("withdrawColl(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
  //     // alice creates a Trove and adds first collateral
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //     await openTrove(dh.testEnv.users[2], {
  //         ICR: toBN(dec(10, 18)),
  //         extraParams: {from: bob},
  //     });
  //
  //     // Price drops
  //     await contracts.priceFeedTestnet.setPrice(dec(100, 18));
  //     const price = await contracts.priceFeedTestnet.getPrice();
  //
  //     assertFalse(await contracts.troveManager.checkRecoveryMode(price));
  //     assertTrue(
  //         (await contracts.troveManager.getCurrentICR(alice, price)).lt(
  //             toBN(dec(110, 16))
  //         )
  //     );
  //
  //     const collWithdrawal = 1; // 1 wei withdrawal
  //
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[1])
  //             .withdrawColl(1, alice, alice, {from: alice})
  //     ).to.be.revertedWith(
  //         "Operation: An operation that would result in ICR < MCR is not permitted"
  //     );
  // });
  //
  // // reverts when calling address does not have active trove
  // it("withdrawColl(): reverts when calling address does not have active trove", async () => {
  //     await openTrove(dh.testEnv.users[1], {
  //         extraZKUSDAmount: toBN(dec(10000, 18)),
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //     await openTrove(dh.testEnv.users[2], {
  //         extraZKUSDAmount: toBN(dec(10000, 18)),
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: bob},
  //     });
  //
  //     // Bob successfully withdraws some coll
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[2])
  //         .withdrawColl(dec(100, "finney"), bob, bob, {from: bob});
  //
  //     // Carol with no active trove attempts to withdraw
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[3])
  //             .withdrawColl(dec(1, "ether"), carol, carol, {from: carol})
  //     ).to.be.revertedWith("Operation: Trove does not exist or is closed");
  // });
  //
  // it("withdrawColl(): reverts when system is in Recovery Mode", async () => {
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //     await openTrove(dh.testEnv.users[2], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: bob},
  //     });
  //
  //     assertFalse(await th.checkRecoveryMode(contracts));
  //
  //     // Withdrawal possible when recoveryMode == false
  //     await contracts.borrowerOperations
  //         .connect(dh.testEnv.users[1])
  //         .withdrawColl(1000, alice, alice, {
  //             from: alice,
  //         });
  //
  //     await contracts.priceFeedTestnet.setPrice(toBN("105000000000000000000"));
  //
  //     assertTrue(await th.checkRecoveryMode(contracts));
  //
  //     //Check withdrawal impossible when recoveryMode == true
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[2])
  //             .withdrawColl(1000, bob, bob, {from: bob})
  //     ).to.be.revertedWith(
  //         "Operation: Collateral withdrawal not permitted Recovery Mode"
  //     );
  // });
  //
  // it("withdrawColl(): reverts when requested ETH withdrawal is > the trove's collateral", async () => {
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: alice},
  //     });
  //     await openTrove(dh.testEnv.users[2], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: bob},
  //     });
  //     await openTrove(dh.testEnv.users[3], {
  //         ICR: toBN(dec(2, 18)),
  //         extraParams: {from: carol},
  //     });
  //
  //     const carolColl = await getTroveEntireColl(carol);
  //     const bobColl = await getTroveEntireColl(bob);
  //     // Carol withdraws exactly all her collateral
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[3])
  //             .withdrawColl(carolColl, carol, carol, {from: carol})
  //     ).to.be.revertedWith(
  //         "Operation: An operation that would result in ICR < MCR is not permitted"
  //     );
  //
  //     // Bob attempts to withdraw 1 wei more than his collateral
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[2])
  //             .withdrawColl(bobColl.add(toBN(1)), bob, bob, {from: bob})
  //     ).to.be.reverted;
  // });
  //
  // it("withdrawColl(): reverts when withdrawal would bring the user's ICR < MCR", async () => {
  //     await openTrove(dh.testEnv.users[5], {
  //         ICR: toBN(dec(10, 18)),
  //         extraParams: {from: whale},
  //     });
  //
  //     await openTrove(dh.testEnv.users[2], {
  //         ICR: toBN(dec(11, 17)),
  //         extraParams: {from: bob},
  //     }); // 110% ICR
  //
  //     // Bob attempts to withdraws 1 wei, Which would leave him with < 110% ICR.
  //
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[2])
  //             .withdrawColl(1, bob, bob, {from: bob})
  //     ).to.be.revertedWith(
  //         "Operation: An operation that would result in ICR < MCR is not permitted"
  //     );
  // });
  // it("withdrawColl(): reverts if system is in Recovery Mode", async () => {
  //     // --- SETUP ---
  //
  //     // A and B open troves at 150% ICR
  //     await openTrove(dh.testEnv.users[2], {
  //         ICR: toBN(dec(15, 17)),
  //         extraParams: {from: bob},
  //     });
  //     await openTrove(dh.testEnv.users[1], {
  //         ICR: toBN(dec(15, 17)),
  //         extraParams: {from: alice},
  //     });
  //
  //     const TCR = (await th.getTCR(contracts)).toString();
  //     assertEqual(TCR, "1500000000000000000");
  //
  //     // --- TEST ---
  //
  //     // price drops to 1ETH:150ZKUSD, reducing TCR below 150%
  //     await contracts.priceFeedTestnet.setPrice("150000000000000000000");
  //
  //     //Alice tries to withdraw collateral during Recovery Mode
  //     await expect(
  //         contracts.borrowerOperations
  //             .connect(dh.testEnv.users[1])
  //             .withdrawColl("1", alice, alice, {from: alice})
  //     ).to.be.reverted;
  // });
  //
  // it("withdrawZKUSD(): reverts when withdrawal would bring the trove's ICR < MCR", async () => {
  //     await openTrove(dh.testEnv.users[1], {ICR: toBN(dec(10, 18)), extraParams: {from: alice}})
  //     await openTrove(dh.testEnv.users[2], {ICR: toBN(dec(11, 17)), extraParams: {from: bob}})
  //
  //     // Bob tries to withdraw ZKUSD that would bring his ICR < MCR
  //     try {
  //         const txBob = await contracts.borrowerOperations.connect(dh.testEnv.users[2]).withdrawZKUSD(th._100pct, 1, bob, bob, {from: bob})
  //         const receipt = await ethers.provider.getTransactionReceipt(txBob.hash)
  //         assert.isFalse(receipt.status)
  //     } catch (err) {
  //         if (err instanceof Error) {
  //             assert.include(err.message, 'revert');
  //         }
  //     }
  // })
  //
  // it("withdrawZKUSD(): reverts when a withdrawal would cause the TCR of the system to fall below the CCR", async () => {
  //     await contracts.priceFeedTestnet.setPrice(dec(100, 18))
  //     const price = await contracts.priceFeedTestnet.getPrice()
  //
  //     // Alice and Bob creates troves with 150% ICR.  System TCR = 150%.
  //     await openTrove(dh.testEnv.users[1], {ICR: toBN(dec(15, 17)), extraParams: {from: alice}})
  //     await openTrove(dh.testEnv.users[2], {ICR: toBN(dec(15, 17)), extraParams: {from: bob}})
  //
  //     var TCR = (await th.getTCR(contracts)).toString()
  //     assert.equal(TCR, '1500000000000000000')
  //
  //     // Bob attempts to withdraw 1 ZKUSD.
  //     // System TCR would be: ((3+3) * 100 ) / (200+201) = 600/401 = 149.62%, i.e. below CCR of 150%.
  //     try {
  //         const txBob = await contracts.borrowerOperations.connect(dh.testEnv.users[2]).withdrawZKUSD(th._100pct, dec(1, 18), bob, bob, {from: bob})
  //         const receipt = await ethers.provider.getTransactionReceipt(txBob.hash)
  //         assert.isFalse(receipt.status)
  //     } catch (err) {
  //         if (err instanceof Error) {
  //             assert.include(err.message, 'revert');
  //         }
  //     }
  // })
  //
  // it("withdrawZKUSD(): reverts if system is in Recovery Mode", async () => {
  //     // --- SETUP ---
  //     await openTrove(dh.testEnv.users[1], {ICR: toBN(dec(15, 17)), extraParams: {from: alice}})
  //     await openTrove(dh.testEnv.users[2], {ICR: toBN(dec(15, 17)), extraParams: {from: bob}})
  //
  //     // --- TEST ---
  //
  //     // price drops to 1ETH:150ZKUSD, reducing TCR below 150%
  //     await contracts.priceFeedTestnet.setPrice('150000000000000000000');
  //     assert.isTrue((await th.getTCR(contracts)).lt(toBN(dec(15, 17))))
  //
  //     try {
  //         const txData = await contracts.borrowerOperations.connect(dh.testEnv.users[1]).withdrawZKUSD(th._100pct, '1', alice, alice, {from: alice})
  //         const receipt = await ethers.provider.getTransactionReceipt(txData.hash)
  //         assert.isFalse(receipt.status)
  //     } catch (err) {
  //         if (err instanceof Error) {
  //             assert.include(err.message, 'revert');
  //         }
  //     }
  // })
  //
  // it("withdrawZKUSD(): increases the Trove's ZKUSD debt by the correct amount", async () => {
  //     await openTrove(dh.testEnv.users[1], {ICR: toBN(dec(2, 18)), extraParams: {from: alice}})
  //
  //     // check before
  //     const aliceDebtBefore = await getTroveEntireDebt(alice)
  //     assert.isTrue(aliceDebtBefore.gt(toBN(0)))
  //
  //     await contracts.borrowerOperations.connect(dh.testEnv.users[1]).withdrawZKUSD(th._100pct, await getNetBorrowingAmount(toBN(100)), alice, alice, {from: alice})
  //
  //     // check after
  //     const aliceDebtAfter = await getTroveEntireDebt(alice)
  //     th.assertIsApproximatelyEqual(aliceDebtAfter, aliceDebtBefore.add(toBN(100)))
  // })

  it("withdrawZKUSD(): increases ZKUSD debt in ActivePool by correct amount", async () => {
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: alice, value: toBN(dec(100, "ether")) },
    });
    const aliceDebtBefore = await getTroveEntireDebt(alice);
    assert.isTrue(aliceDebtBefore.gt(toBN(0)));

    // check before
    const activePool_ZKUSD_Before = await activePool.getZKUSDDebt();
    assert.isTrue(activePool_ZKUSD_Before.eq(aliceDebtBefore));

    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .withdrawZKUSD(
        th._100pct,
        await getNetBorrowingAmount(dec(1000, 18)),
        alice,
        alice,
        { from: alice }
      );

    // check after
    const activePool_ZKUSD_After = await activePool.getZKUSDDebt();
    th.assertIsApproximatelyEqual(
      activePool_ZKUSD_After,
      activePool_ZKUSD_Before.add(toBN(dec(1000, 18)))
    );
  });

  it("withdrawZKUSD(): increases user ZKUSDToken balance by correct amount", async () => {
    await openTrove(dh.testEnv.users[1], {
      extraParams: { value: toBN(dec(100, "ether")), from: alice },
    });

    // check before
    const alice_ZKUSDTokenBalance_Before = await zkusdToken.balanceOf(alice);
    assert.isTrue(alice_ZKUSDTokenBalance_Before.gt(toBN("0")));

    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .withdrawZKUSD(th._100pct, dec(10000, 18), alice, alice, { from: alice });

    // check after
    const alice_ZKUSDTokenBalance_After = await zkusdToken.balanceOf(alice);
    assert.isTrue(
      alice_ZKUSDTokenBalance_After.eq(
        alice_ZKUSDTokenBalance_Before.add(toBN(dec(10000, 18)))
      )
    );
  });
  //
  // // --- repayZKUSD() ---
  // it("repayZKUSD(): reverts when repayment would leave trove with ICR < MCR", async () => {
  //   // alice creates a Trove and adds first collateral
  //   await openTrove(dh.testEnv.users[1], {
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[2], {
  //     ICR: toBN(dec(10, 18)),
  //     extraParams: { from: bob },
  //   });
  //
  //   // Price drops
  //   await contracts.priceFeedTestnet.setPrice(dec(100, 18));
  //   const price = await contracts.priceFeedTestnet.getPrice();
  //
  //   assert.isFalse(await contracts.troveManager.checkRecoveryMode(price));
  //   assert.isTrue(
  //     (await contracts.troveManager.getCurrentICR(alice, price)).lt(
  //       toBN(dec(110, 16))
  //     )
  //   );
  //
  //   const ZKUSDRepayment = 1; // 1 wei repayment
  //
  //   await th.assertRevert(
  //     await contracts.borrowerOperations
  //       .connect(dh.testEnv.users[1])
  //       .repayZKUSD(ZKUSDRepayment, alice, alice, { from: alice })
  //   );
  // });
  //
  // it("repayZKUSD(): Succeeds when it would leave trove with net debt >= minimum net debt", async () => {
  //   // Make the ZKUSD request 2 wei above min net debt to correct for floor division, and make net debt = min net debt + 1 wei
  //   await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[6])
  //     .openTrove(
  //       th._100pct,
  //       await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN("2"))),
  //       A,
  //       A,
  //       {
  //         from: A,
  //         value: dec(100, 30),
  //       }
  //     );
  //
  //   const repayTxA = await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[6])
  //     .repayZKUSD(1, A, A, { from: A });
  //   const receipt = await ethers.provider.getTransactionReceipt(repayTxA.hash);
  //   assert.isTrue(receipt.status);
  //
  //   await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[7])
  //     .openTrove(th._100pct, dec(20, 25), B, B, {
  //       from: B,
  //       value: dec(100, 30),
  //     });
  //
  //   const repayTxB = await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[7])
  //     .repayZKUSD(dec(19, 25), B, B, { from: B });
  //   const receiptB = await ethers.provider.getTransactionReceipt(repayTxB.hash);
  //   assert.isTrue(receiptB.status);
  // });
  //
  // it("repayZKUSD(): reverts when it would leave trove with net debt < minimum net debt", async () => {
  //   // Make the ZKUSD request 2 wei above min net debt to correct for floor division, and make net debt = min net debt + 1 wei
  //   await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[6])
  //     .openTrove(
  //       th._100pct,
  //       await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN("2"))),
  //       A,
  //       A,
  //       {
  //         from: A,
  //         value: dec(100, 30),
  //       }
  //     );
  //
  //   const repayTxAPromise = await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[6])
  //     .repayZKUSD(2, A, A, { from: A });
  //   await th.assertRevert(repayTxAPromise);
  // });
  //
  // it("adjustTrove(): Reverts if repaid amount is greater than current debt", async () => {
  //   const { totalDebt } = await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(10, 18)),
  //     extraParams: { from: alice },
  //   });
  //   ZKUSD_GAS_COMPENSATION =
  //     await contracts.borrowerOperations.ZKUSD_GAS_COMPENSATION();
  //   const repayAmount = totalDebt.sub(ZKUSD_GAS_COMPENSATION).add(toBN(1));
  //   await openTrove(dh.testEnv.users[2], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(10, 18)),
  //     extraParams: { from: bob },
  //   });
  //
  //   await zkusdToken.transfer(alice, repayAmount, { from: bob });
  //
  //   await th.assertRevert(
  //     await contracts.borrowerOperations
  //       .connect(dh.testEnv.users[6])
  //       .adjustTrove(th._100pct, 0, repayAmount, false, alice, alice, {
  //         from: alice,
  //       })
  //   );
  // });
  //
  // it("repayZKUSD(): reverts when calling address does not have active trove", async () => {
  //   await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[2], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: bob },
  //   });
  //   // Bob successfully repays some ZKUSD
  //   const txBob = await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[2])
  //     .repayZKUSD(dec(10, 18), bob, bob, { from: bob });
  //   const receipt = await ethers.provider.getTransactionReceipt(txBob.hash);
  //   assert.isTrue(receipt.status);
  //
  //   // Carol with no active trove attempts to repayZKUSD
  //   const txCarol = await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[3])
  //     .repayZKUSD(dec(10, 18), carol, carol, { from: carol });
  //   await th.assertRevert(txCarol);
  // });
  //
  // it("repayZKUSD(): reverts when attempted repayment is > the debt of the trove", async () => {
  //   await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[2], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: bob },
  //   });
  //   const aliceDebt = await getTroveEntireDebt(alice);
  //
  //   // Bob successfully repays some ZKUSD
  //   const txBob = await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[2])
  //     .repayZKUSD(dec(10, 18), bob, bob, { from: bob });
  //   const receipt = await ethers.provider.getTransactionReceipt(txBob.hash);
  //   assert.isTrue(receipt.status);
  //
  //   // Alice attempts to repay more than her debt
  //   const txAlice = await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[1])
  //     .repayZKUSD(aliceDebt.add(toBN(dec(1, 18))), alice, alice, {
  //       from: alice,
  //     });
  //   await th.assertRevert(txAlice);
  // });
  //
  // //repayZKUSD: reduces ZKUSD debt in Trove
  // it("repayZKUSD(): reduces the Trove's ZKUSD debt by the correct amount", async () => {
  //   await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[2], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: bob },
  //   });
  //   const aliceDebtBefore = await getTroveEntireDebt(alice);
  //   assert.isTrue(aliceDebtBefore.gt(toBN("0")));
  //
  //   await contracts.borrowerOperations
  //     .connect(dh.testEnv.users[1])
  //     .repayZKUSD(aliceDebtBefore.div(toBN(10)), alice, alice, { from: alice }); // Repays 1/10 her debt
  //
  //   const aliceDebtAfter = await getTroveEntireDebt(alice);
  //   assert.isTrue(aliceDebtAfter.gt(toBN("0")));
  //
  //   th.assertIsApproximatelyEqual(
  //     aliceDebtAfter,
  //     aliceDebtBefore.mul(toBN(9)).div(toBN(10))
  //   ); // check 9/10 debt remaining
  // });
  //
  // it("repayZKUSD(): decreases ZKUSD debt in ActivePool by correct amount", async () => {
  //   await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[2], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: bob },
  //   });
  //   const aliceDebtBefore = await getTroveEntireDebt(alice);
  //   assert.isTrue(aliceDebtBefore.gt(toBN("0")));
  //
  //   // Check before
  //   const activePool_ZKUSD_Before = await activePool.getZKUSDDebt();
  //   assert.isTrue(activePool_ZKUSD_Before.gt(toBN("0")));
  //
  //   await contracts.borrowerOperations.repayZKUSD(
  //     aliceDebtBefore.div(toBN(10)),
  //     alice,
  //     alice,
  //     { from: alice }
  //   ); // Repays 1/10 her debt
  //
  //   // check after
  //   const activePool_ZKUSD_After = await activePool.getZKUSDDebt();
  //   th.assertIsApproximatelyEqual(
  //     activePool_ZKUSD_After,
  //     activePool_ZKUSD_Before.sub(aliceDebtBefore.div(toBN(10)))
  //   );
  // });
  //
  // it("repayZKUSD(): decreases user ZKUSDToken balance by correct amount", async () => {
  //   await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[2], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: bob },
  //   });
  //   const aliceDebtBefore = await getTroveEntireDebt(alice);
  //   assert.isTrue(aliceDebtBefore.gt(toBN("0")));
  //
  //   // check before
  //   const alice_ZKUSDTokenBalance_Before = await zkusdToken.balanceOf(alice);
  //   assert.isTrue(alice_ZKUSDTokenBalance_Before.gt(toBN("0")));
  //
  //   await contracts.borrowerOperations.repayZKUSD(
  //     aliceDebtBefore.div(toBN(10)),
  //     alice,
  //     alice,
  //     { from: alice }
  //   ); // Repays 1/10 her debt
  //
  //   // check after
  //   const alice_ZKUSDTokenBalance_After = await zkusdToken.balanceOf(alice);
  //   th.assertIsApproximatelyEqual(
  //     alice_ZKUSDTokenBalance_After,
  //     alice_ZKUSDTokenBalance_Before.sub(aliceDebtBefore.div(toBN(10)))
  //   );
  // });
  //
  // it("repayZKUSD(): can repay debt in Recovery Mode", async () => {
  //   await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[2], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: bob },
  //   });
  //   const aliceDebtBefore = await getTroveEntireDebt(alice);
  //   assert.isTrue(aliceDebtBefore.gt(toBN("0")));
  //
  //   assert.isFalse(await th.checkRecoveryMode(contracts));
  //
  //   await contracts.priceFeedTestnet.setPrice("105000000000000000000");
  //
  //   assert.isTrue(await th.checkRecoveryMode(contracts));
  //
  //   const tx = await contracts.borrowerOperations.repayZKUSD(
  //     aliceDebtBefore.div(toBN(10)),
  //     alice,
  //     alice,
  //     { from: alice }
  //   );
  //   const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
  //   assert.isTrue(receipt.status);
  //
  //   // Check Alice's debt: 110 (initial) - 50 (repaid)
  //   const aliceDebtAfter = await getTroveEntireDebt(alice);
  //   th.assertIsApproximatelyEqual(
  //     aliceDebtAfter,
  //     aliceDebtBefore.mul(toBN(9)).div(toBN(10))
  //   );
  // });
  //
  // it("repayZKUSD(): Reverts if borrower has insufficient ZKUSD balance to cover his debt repayment", async () => {
  //   await openTrove(dh.testEnv.users[1], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: alice },
  //   });
  //   await openTrove(dh.testEnv.users[7], {
  //     extraZKUSDAmount: toBN(dec(10000, 18)),
  //     ICR: toBN(dec(2, 18)),
  //     extraParams: { from: B },
  //   });
  //   const bobBalBefore = await zkusdToken.balanceOf(B);
  //   assert.isTrue(bobBalBefore.gt(toBN("0")));
  //
  //   // Bob transfers all but 5 of his ZKUSD to Carol
  //   await zkusdToken.transfer(C, bobBalBefore.sub(toBN(dec(5, 18))), {
  //     from: B,
  //   });
  //
  //   //Confirm B's ZKUSD balance has decreased to 5 ZKUSD
  //   const bobBalAfter = await zkusdToken.balanceOf(B);
  //
  //   assert.isTrue(bobBalAfter.eq(toBN(dec(5, 18))));
  //
  //   // Bob tries to repay 6 ZKUSD
  //   const repayZKUSDPromise_B = contracts.borrowerOperations.repayZKUSD(
  //     toBN(dec(6, 18)),
  //     B,
  //     B,
  //     { from: B }
  //   );
  //
  //   await th.assertRevert(await repayZKUSDPromise_B);
  // });

  // // --- closeTrove() ---
  //
  // it("closeTrove(): reverts when it would lower the TCR below CCR", async () => {
  //     await openTrove({ ICR: toBN(dec(300, 16)), extraParams:{ from: alice } })
  //     await openTrove({ ICR: toBN(dec(120, 16)), extraZKUSDAmount: toBN(dec(300, 18)), extraParams:{ from: bob } })
  //
  //     const price = await priceFeed.getPrice()
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, dec(300, 18), { from: bob })
  //
  //     assert.isFalse(await troveManager.checkRecoveryMode(price))
  //
  //     await assertRevert(
  //         contracts.borrowerOperations.closeTrove({ from: alice }),
  //         "BorrowerOps: An operation that would result in TCR < CCR is not permitted"
  //     )
  // })
  //
  // it("closeTrove(): reverts when calling address does not have active trove", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: bob } })
  //
  //     // Carol with no active trove attempts to close her trove
  //     try {
  //         const txCarol = await contracts.borrowerOperations.closeTrove({ from: carol })
  //         assert.isFalse(txCarol.receipt.status)
  //     } catch (err) {
  //         assert.include(err.message, "revert")
  //     }
  // })
  //
  // it("closeTrove(): reverts when system is in Recovery Mode", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(100000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })
  //
  //     // Alice transfers her ZKUSD to Bob and Carol so they can cover fees
  //     const aliceBal = await zkusdToken.balanceOf(alice)
  //     await zkusdToken.transfer(bob, aliceBal.div(toBN(2)), { from: alice })
  //     await zkusdToken.transfer(carol, aliceBal.div(toBN(2)), { from: alice })
  //
  //     // check Recovery Mode
  //     assert.isFalse(await th.checkRecoveryMode(contracts))
  //
  //     // Bob successfully closes his trove
  //     const txBob = await contracts.borrowerOperations.closeTrove({ from: bob })
  //     assert.isTrue(txBob.receipt.status)
  //
  //     await priceFeed.setPrice(dec(100, 18))
  //
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //
  //     // Carol attempts to close her trove during Recovery Mode
  //     await assertRevert(borrowerOperations.closeTrove({ from: carol }), "BorrowerOps: Operation not permitted during Recovery Mode")
  // })
  //
  // it("closeTrove(): reverts when trove is the only one in the system", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(100000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     // Artificially mint to Alice so she has enough to close her trove
  //     await zkusdToken.unprotectedMint(alice, dec(100000, 18))
  //
  //     // Check she has more ZKUSD than her trove debt
  //     const aliceBal = await zkusdToken.balanceOf(alice)
  //     const aliceDebt = await getTroveEntireDebt(alice)
  //     assert.isTrue(aliceBal.gt(aliceDebt))
  //
  //     // check Recovery Mode
  //     assert.isFalse(await th.checkRecoveryMode(contracts))
  //
  //     // Alice attempts to close her trove
  //     await assertRevert(borrowerOperations.closeTrove({ from: alice }), "TroveManager: Only one trove in the system")
  // })
  //
  // it("closeTrove(): reduces a Trove's collateral to zero", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     const aliceCollBefore = await getTroveEntireColl(alice)
  //     const dennisZKUSD = await zkusdToken.balanceOf(dennis)
  //     assert.isTrue(aliceCollBefore.gt(toBN('0')))
  //     assert.isTrue(dennisZKUSD.gt(toBN('0')))
  //
  //     // To compensate borrowing fees
  //     await zkusdToken.transfer(alice, dennisZKUSD.div(toBN(2)), { from: dennis })
  //
  //     // Alice attempts to close trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     const aliceCollAfter = await getTroveEntireColl(alice)
  //     assert.equal(aliceCollAfter, '0')
  // })
  //
  // it("closeTrove(): reduces a Trove's debt to zero", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     const aliceDebtBefore = await getTroveEntireColl(alice)
  //     const dennisZKUSD = await zkusdToken.balanceOf(dennis)
  //     assert.isTrue(aliceDebtBefore.gt(toBN('0')))
  //     assert.isTrue(dennisZKUSD.gt(toBN('0')))
  //
  //     // To compensate borrowing fees
  //     await zkusdToken.transfer(alice, dennisZKUSD.div(toBN(2)), { from: dennis })
  //
  //     // Alice attempts to close trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     const aliceCollAfter = await getTroveEntireColl(alice)
  //     assert.equal(aliceCollAfter, '0')
  // })
  //
  // it("closeTrove(): sets Trove's stake to zero", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     const aliceStakeBefore = await getTroveStake(alice)
  //     assert.isTrue(aliceStakeBefore.gt(toBN('0')))
  //
  //     const dennisZKUSD = await zkusdToken.balanceOf(dennis)
  //     assert.isTrue(aliceStakeBefore.gt(toBN('0')))
  //     assert.isTrue(dennisZKUSD.gt(toBN('0')))
  //
  //     // To compensate borrowing fees
  //     await zkusdToken.transfer(alice, dennisZKUSD.div(toBN(2)), { from: dennis })
  //
  //     // Alice attempts to close trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     const stakeAfter = ((await troveManager.Troves(alice))[2]).toString()
  //     assert.equal(stakeAfter, '0')
  //     // check withdrawal was successful
  // })
  //
  // it("closeTrove(): zero's the troves reward snapshots", async () => {
  //     // Dennis opens trove and transfers tokens to alice
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
  //
  //     // Price drops
  //     await priceFeed.setPrice(dec(100, 18))
  //
  //     // Liquidate Bob
  //     await troveManager.liquidate(bob)
  //     assert.isFalse(await sortedTroves.contains(bob))
  //
  //     // Price bounces back
  //     await priceFeed.setPrice(dec(200, 18))
  //
  //     // Alice and Carol open troves
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })
  //
  //     // Price drops ...again
  //     await priceFeed.setPrice(dec(100, 18))
  //
  //     // Get Alice's pending reward snapshots
  //     const L_ETH_A_Snapshot = (await troveManager.rewardSnapshots(alice))[0]
  //     const L_ZKUSDDebt_A_Snapshot = (await troveManager.rewardSnapshots(alice))[1]
  //     assert.isTrue(L_ETH_A_Snapshot.gt(toBN('0')))
  //     assert.isTrue(L_ZKUSDDebt_A_Snapshot.gt(toBN('0')))
  //
  //     // Liquidate Carol
  //     await troveManager.liquidate(carol)
  //     assert.isFalse(await sortedTroves.contains(carol))
  //
  //     // Get Alice's pending reward snapshots after Carol's liquidation. Check above 0
  //     const L_ETH_Snapshot_A_AfterLiquidation = (await troveManager.rewardSnapshots(alice))[0]
  //     const L_ZKUSDDebt_Snapshot_A_AfterLiquidation = (await troveManager.rewardSnapshots(alice))[1]
  //
  //     assert.isTrue(L_ETH_Snapshot_A_AfterLiquidation.gt(toBN('0')))
  //     assert.isTrue(L_ZKUSDDebt_Snapshot_A_AfterLiquidation.gt(toBN('0')))
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, await zkusdToken.balanceOf(dennis), { from: dennis })
  //
  //     await priceFeed.setPrice(dec(200, 18))
  //
  //     // Alice closes trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     // Check Alice's pending reward snapshots are zero
  //     const L_ETH_Snapshot_A_afterAliceCloses = (await troveManager.rewardSnapshots(alice))[0]
  //     const L_ZKUSDDebt_Snapshot_A_afterAliceCloses = (await troveManager.rewardSnapshots(alice))[1]
  //
  //     assert.equal(L_ETH_Snapshot_A_afterAliceCloses, '0')
  //     assert.equal(L_ZKUSDDebt_Snapshot_A_afterAliceCloses, '0')
  // })
  //
  // it("closeTrove(): sets trove's status to closed and removes it from sorted troves list", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     // Check Trove is active
  //     const alice_Trove_Before = await troveManager.Troves(alice)
  //     const status_Before = alice_Trove_Before[3]
  //
  //     assert.equal(status_Before, 1)
  //     assert.isTrue(await sortedTroves.contains(alice))
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, await zkusdToken.balanceOf(dennis), { from: dennis })
  //
  //     // Close the trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     const alice_Trove_After = await troveManager.Troves(alice)
  //     const status_After = alice_Trove_After[3]
  //
  //     assert.equal(status_After, 2)
  //     assert.isFalse(await sortedTroves.contains(alice))
  // })
  //
  // it("closeTrove(): reduces ActivePool ETH and raw ether by correct amount", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     const dennisColl = await getTroveEntireColl(dennis)
  //     const aliceColl = await getTroveEntireColl(alice)
  //     assert.isTrue(dennisColl.gt('0'))
  //     assert.isTrue(aliceColl.gt('0'))
  //
  //     // Check active Pool ETH before
  //     const activePool_ETH_before = await activePool.getETH()
  //     const activePool_RawEther_before = toBN(await web3.eth.getBalance(activePool.address))
  //     assert.isTrue(activePool_ETH_before.eq(aliceColl.add(dennisColl)))
  //     assert.isTrue(activePool_ETH_before.gt(toBN('0')))
  //     assert.isTrue(activePool_RawEther_before.eq(activePool_ETH_before))
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, await zkusdToken.balanceOf(dennis), { from: dennis })
  //
  //     // Close the trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     // Check after
  //     const activePool_ETH_After = await activePool.getETH()
  //     const activePool_RawEther_After = toBN(await web3.eth.getBalance(activePool.address))
  //     assert.isTrue(activePool_ETH_After.eq(dennisColl))
  //     assert.isTrue(activePool_RawEther_After.eq(dennisColl))
  // })
  //
  // it("closeTrove(): reduces ActivePool debt by correct amount", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     const dennisDebt = await getTroveEntireDebt(dennis)
  //     const aliceDebt = await getTroveEntireDebt(alice)
  //     assert.isTrue(dennisDebt.gt('0'))
  //     assert.isTrue(aliceDebt.gt('0'))
  //
  //     // Check before
  //     const activePool_Debt_before = await activePool.getZKUSDDebt()
  //     assert.isTrue(activePool_Debt_before.eq(aliceDebt.add(dennisDebt)))
  //     assert.isTrue(activePool_Debt_before.gt(toBN('0')))
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, await zkusdToken.balanceOf(dennis), { from: dennis })
  //
  //     // Close the trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     // Check after
  //     const activePool_Debt_After = (await activePool.getZKUSDDebt()).toString()
  //     th.assertIsApproximatelyEqual(activePool_Debt_After, dennisDebt)
  // })
  //
  // it("closeTrove(): updates the the total stakes", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
  //
  //     // Get individual stakes
  //     const aliceStakeBefore = await getTroveStake(alice)
  //     const bobStakeBefore = await getTroveStake(bob)
  //     const dennisStakeBefore = await getTroveStake(dennis)
  //     assert.isTrue(aliceStakeBefore.gt('0'))
  //     assert.isTrue(bobStakeBefore.gt('0'))
  //     assert.isTrue(dennisStakeBefore.gt('0'))
  //
  //     const totalStakesBefore = await troveManager.totalStakes()
  //
  //     assert.isTrue(totalStakesBefore.eq(aliceStakeBefore.add(bobStakeBefore).add(dennisStakeBefore)))
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, await zkusdToken.balanceOf(dennis), { from: dennis })
  //
  //     // Alice closes trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     // Check stake and total stakes get updated
  //     const aliceStakeAfter = await getTroveStake(alice)
  //     const totalStakesAfter = await troveManager.totalStakes()
  //
  //     assert.equal(aliceStakeAfter, 0)
  //     assert.isTrue(totalStakesAfter.eq(totalStakesBefore.sub(aliceStakeBefore)))
  // })
  //
  // if (!withProxy) { // TODO: wrap web3.eth.getBalance to be able to go through proxies
  //     it("closeTrove(): sends the correct amount of ETH to the user", async () => {
  //         await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //         await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //         const aliceColl = await getTroveEntireColl(alice)
  //         assert.isTrue(aliceColl.gt(toBN('0')))
  //
  //         const alice_ETHBalance_Before = web3.utils.toBN(await web3.eth.getBalance(alice))
  //
  //         // to compensate borrowing fees
  //         await zkusdToken.transfer(alice, await zkusdToken.balanceOf(dennis), { from: dennis })
  //
  //         await contracts.borrowerOperations.closeTrove({ from: alice, gasPrice: 0 })
  //
  //         const alice_ETHBalance_After = web3.utils.toBN(await web3.eth.getBalance(alice))
  //         const balanceDiff = alice_ETHBalance_After.sub(alice_ETHBalance_Before)
  //
  //         assert.isTrue(balanceDiff.eq(aliceColl))
  //     })
  // }
  //
  // it("closeTrove(): subtracts the debt of the closed Trove from the Borrower's ZKUSDToken balance", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     const aliceDebt = await getTroveEntireDebt(alice)
  //     assert.isTrue(aliceDebt.gt(toBN('0')))
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, await zkusdToken.balanceOf(dennis), { from: dennis })
  //
  //     const alice_ZKUSDBalance_Before = await zkusdToken.balanceOf(alice)
  //     assert.isTrue(alice_ZKUSDBalance_Before.gt(toBN('0')))
  //
  //     // close trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     // check alice ZKUSD balance after
  //     const alice_ZKUSDBalance_After = await zkusdToken.balanceOf(alice)
  //     th.assertIsApproximatelyEqual(alice_ZKUSDBalance_After, alice_ZKUSDBalance_Before.sub(aliceDebt.sub(ZKUSD_GAS_COMPENSATION)))
  // })
  //
  // it("closeTrove(): applies pending rewards", async () => {
  //     // --- SETUP ---
  //     await openTrove({ extraZKUSDAmount: toBN(dec(1000000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     const whaleDebt = await getTroveEntireDebt(whale)
  //     const whaleColl = await getTroveEntireColl(whale)
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(15000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })
  //
  //     const carolDebt = await getTroveEntireDebt(carol)
  //     const carolColl = await getTroveEntireColl(carol)
  //
  //     // Whale transfers to A and B to cover their fees
  //     await zkusdToken.transfer(alice, dec(10000, 18), { from: whale })
  //     await zkusdToken.transfer(bob, dec(10000, 18), { from: whale })
  //
  //     // --- TEST ---
  //
  //     // price drops to 1ETH:100ZKUSD, reducing Carol's ICR below MCR
  //     await priceFeed.setPrice(dec(100, 18));
  //     const price = await priceFeed.getPrice()
  //
  //     // liquidate Carol's Trove, Alice and Bob earn rewards.
  //     const liquidationTx = await troveManager.liquidate(carol, { from: owner });
  //     const [liquidatedDebt_C, liquidatedColl_C, gasComp_C] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //     // Dennis opens a new Trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })
  //
  //     // check Alice and Bob's reward snapshots are zero before they alter their Troves
  //     const alice_rewardSnapshot_Before = await troveManager.rewardSnapshots(alice)
  //     const alice_ETHrewardSnapshot_Before = alice_rewardSnapshot_Before[0]
  //     const alice_ZKUSDDebtRewardSnapshot_Before = alice_rewardSnapshot_Before[1]
  //
  //     const bob_rewardSnapshot_Before = await troveManager.rewardSnapshots(bob)
  //     const bob_ETHrewardSnapshot_Before = bob_rewardSnapshot_Before[0]
  //     const bob_ZKUSDDebtRewardSnapshot_Before = bob_rewardSnapshot_Before[1]
  //
  //     assert.equal(alice_ETHrewardSnapshot_Before, 0)
  //     assert.equal(alice_ZKUSDDebtRewardSnapshot_Before, 0)
  //     assert.equal(bob_ETHrewardSnapshot_Before, 0)
  //     assert.equal(bob_ZKUSDDebtRewardSnapshot_Before, 0)
  //
  //     const defaultPool_ETH = await defaultPool.getETH()
  //     const defaultPool_ZKUSDDebt = await defaultPool.getZKUSDDebt()
  //
  //     // Carol's liquidated coll (1 ETH) and drawn debt should have entered the Default Pool
  //     assert.isAtMost(th.getDifference(defaultPool_ETH, liquidatedColl_C), 100)
  //     assert.isAtMost(th.getDifference(defaultPool_ZKUSDDebt, liquidatedDebt_C), 100)
  //
  //     const pendingCollReward_A = await troveManager.getPendingETHReward(alice)
  //     const pendingDebtReward_A = await troveManager.getPendingZKUSDDebtReward(alice)
  //     assert.isTrue(pendingCollReward_A.gt('0'))
  //     assert.isTrue(pendingDebtReward_A.gt('0'))
  //
  //     // Close Alice's trove. Alice's pending rewards should be removed from the DefaultPool when she close.
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     const defaultPool_ETH_afterAliceCloses = await defaultPool.getETH()
  //     const defaultPool_ZKUSDDebt_afterAliceCloses = await defaultPool.getZKUSDDebt()
  //
  //     assert.isAtMost(th.getDifference(defaultPool_ETH_afterAliceCloses,
  //         defaultPool_ETH.sub(pendingCollReward_A)), 1000)
  //     assert.isAtMost(th.getDifference(defaultPool_ZKUSDDebt_afterAliceCloses,
  //         defaultPool_ZKUSDDebt.sub(pendingDebtReward_A)), 1000)
  //
  //     // whale adjusts trove, pulling their rewards out of DefaultPool
  //     await contracts.borrowerOperations.adjustTrove(th._100pct, 0, dec(1, 18), true, whale, whale, { from: whale })
  //
  //     // Close Bob's trove. Expect DefaultPool coll and debt to drop to 0, since closing pulls his rewards out.
  //     await contracts.borrowerOperations.closeTrove({ from: bob })
  //
  //     const defaultPool_ETH_afterBobCloses = await defaultPool.getETH()
  //     const defaultPool_ZKUSDDebt_afterBobCloses = await defaultPool.getZKUSDDebt()
  //
  //     assert.isAtMost(th.getDifference(defaultPool_ETH_afterBobCloses, 0), 100000)
  //     assert.isAtMost(th.getDifference(defaultPool_ZKUSDDebt_afterBobCloses, 0), 100000)
  // })
  //
  // it("closeTrove(): reverts if borrower has insufficient ZKUSD balance to repay his entire debt", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(15000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //
  //     //Confirm Bob's ZKUSD balance is less than his trove debt
  //     const B_ZKUSDBal = await zkusdToken.balanceOf(B)
  //     const B_troveDebt = await getTroveEntireDebt(B)
  //
  //     assert.isTrue(B_ZKUSDBal.lt(B_troveDebt))
  //
  //     const closeTrovePromise_B = contracts.borrowerOperations.closeTrove({ from: B })
  //
  //     // Check closing trove reverts
  //     await assertRevert(closeTrovePromise_B, "BorrowerOps: Caller doesnt have enough ZKUSD to make repayment")
  // })
  //
  // // --- openTrove() ---
  //
  // if (!withProxy) { // TODO: use rawLogs instead of logs
  //     it("openTrove(): emits a TroveUpdated event with the correct collateral and debt", async () => {
  //         const txA = (await openTrove({ extraZKUSDAmount: toBN(dec(15000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })).tx
  //         const txB = (await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })).tx
  //         const txC = (await openTrove({ extraZKUSDAmount: toBN(dec(3000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })).tx
  //
  //         const A_Coll = await getTroveEntireColl(A)
  //         const B_Coll = await getTroveEntireColl(B)
  //         const C_Coll = await getTroveEntireColl(C)
  //         const A_Debt = await getTroveEntireDebt(A)
  //         const B_Debt = await getTroveEntireDebt(B)
  //         const C_Debt = await getTroveEntireDebt(C)
  //
  //         const A_emittedDebt = toBN(th.getEventArgByName(txA, "TroveUpdated", "_debt"))
  //         const A_emittedColl = toBN(th.getEventArgByName(txA, "TroveUpdated", "_coll"))
  //         const B_emittedDebt = toBN(th.getEventArgByName(txB, "TroveUpdated", "_debt"))
  //         const B_emittedColl = toBN(th.getEventArgByName(txB, "TroveUpdated", "_coll"))
  //         const C_emittedDebt = toBN(th.getEventArgByName(txC, "TroveUpdated", "_debt"))
  //         const C_emittedColl = toBN(th.getEventArgByName(txC, "TroveUpdated", "_coll"))
  //
  //         // Check emitted debt values are correct
  //         assert.isTrue(A_Debt.eq(A_emittedDebt))
  //         assert.isTrue(B_Debt.eq(B_emittedDebt))
  //         assert.isTrue(C_Debt.eq(C_emittedDebt))
  //
  //         // Check emitted coll values are correct
  //         assert.isTrue(A_Coll.eq(A_emittedColl))
  //         assert.isTrue(B_Coll.eq(B_emittedColl))
  //         assert.isTrue(C_Coll.eq(C_emittedColl))
  //
  //         const baseRateBefore = await troveManager.baseRate()
  //
  //         // Artificially make baseRate 5%
  //         await troveManager.setBaseRate(dec(5, 16))
  //         await troveManager.setLastFeeOpTimeToNow()
  //
  //         assert.isTrue((await troveManager.baseRate()).gt(baseRateBefore))
  //
  //         const txD = (await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })).tx
  //         const txE = (await openTrove({ extraZKUSDAmount: toBN(dec(3000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })).tx
  //         const D_Coll = await getTroveEntireColl(D)
  //         const E_Coll = await getTroveEntireColl(E)
  //         const D_Debt = await getTroveEntireDebt(D)
  //         const E_Debt = await getTroveEntireDebt(E)
  //
  //         const D_emittedDebt = toBN(th.getEventArgByName(txD, "TroveUpdated", "_debt"))
  //         const D_emittedColl = toBN(th.getEventArgByName(txD, "TroveUpdated", "_coll"))
  //
  //         const E_emittedDebt = toBN(th.getEventArgByName(txE, "TroveUpdated", "_debt"))
  //         const E_emittedColl = toBN(th.getEventArgByName(txE, "TroveUpdated", "_coll"))
  //
  //         // Check emitted debt values are correct
  //         assert.isTrue(D_Debt.eq(D_emittedDebt))
  //         assert.isTrue(E_Debt.eq(E_emittedDebt))
  //
  //         // Check emitted coll values are correct
  //         assert.isTrue(D_Coll.eq(D_emittedColl))
  //         assert.isTrue(E_Coll.eq(E_emittedColl))
  //     })
  // }
  //
  // it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
  //     // Add 1 wei to correct for rounding error in helper function
  //     const txA = await contracts.borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN(1))), A, A, { from: A, value: dec(100, 30) })
  //     assert.isTrue(txA.receipt.status)
  //     assert.isTrue(await sortedTroves.contains(A))
  //
  //     const txC = await contracts.borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN(dec(47789898, 22)))), A, A, { from: C, value: dec(100, 30) })
  //     assert.isTrue(txC.receipt.status)
  //     assert.isTrue(await sortedTroves.contains(C))
  // })
  //
  // it("openTrove(): reverts if net debt < minimum net debt", async () => {
  //     const txAPromise = contracts.borrowerOperations.openTrove(th._100pct, 0, A, A, { from: A, value: dec(100, 30) })
  //     await assertRevert(txAPromise, "revert")
  //
  //     const txBPromise = contracts.borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.sub(toBN(1))), B, B, { from: B, value: dec(100, 30) })
  //     await assertRevert(txBPromise, "revert")
  //
  //     const txCPromise = contracts.borrowerOperations.openTrove(th._100pct, MIN_NET_DEBT.sub(toBN(dec(173, 18))), C, C, { from: C, value: dec(100, 30) })
  //     await assertRevert(txCPromise, "revert")
  // })
  //
  // it("openTrove(): decays a non-zero base rate", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     // Check baseRate is now non-zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_1.gt(toBN('0')))
  //
  //     // 2 hours pass
  //     th.fastForwardTime(7200, web3.currentProvider)
  //
  //     // D opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
  //
  //     // Check baseRate has decreased
  //     const baseRate_2 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_2.lt(baseRate_1))
  //
  //     // 1 hour passes
  //     th.fastForwardTime(3600, web3.currentProvider)
  //
  //     // E opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(12, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })
  //
  //     const baseRate_3 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_3.lt(baseRate_2))
  // })
  //
  // it("openTrove(): doesn't change base rate if it is already zero", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Check baseRate is zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.equal(baseRate_1, '0')
  //
  //     // 2 hours pass
  //     th.fastForwardTime(7200, web3.currentProvider)
  //
  //     // D opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
  //
  //     // Check baseRate is still 0
  //     const baseRate_2 = await troveManager.baseRate()
  //     assert.equal(baseRate_2, '0')
  //
  //     // 1 hour passes
  //     th.fastForwardTime(3600, web3.currentProvider)
  //
  //     // E opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(12, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })
  //
  //     const baseRate_3 = await troveManager.baseRate()
  //     assert.equal(baseRate_3, '0')
  // })
  //
  // it("openTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     // Check baseRate is now non-zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_1.gt(toBN('0')))
  //
  //     const lastFeeOpTime_1 = await troveManager.lastFeeOperationTime()
  //
  //     // Borrower D triggers a fee
  //     await openTrove({ extraZKUSDAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
  //
  //     const lastFeeOpTime_2 = await troveManager.lastFeeOperationTime()
  //
  //     // Check that the last fee operation time did not update, as borrower D's debt issuance occured
  //     // since before minimum interval had passed
  //     assert.isTrue(lastFeeOpTime_2.eq(lastFeeOpTime_1))
  //
  //     // 1 minute passes
  //     th.fastForwardTime(60, web3.currentProvider)
  //
  //     // Check that now, at least one minute has passed since lastFeeOpTime_1
  //     const timeNow = await th.getLatestBlockTimestamp(web3)
  //     assert.isTrue(toBN(timeNow).sub(lastFeeOpTime_1).gte(3600))
  //
  //     // Borrower E triggers a fee
  //     await openTrove({ extraZKUSDAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })
  //
  //     const lastFeeOpTime_3 = await troveManager.lastFeeOperationTime()
  //
  //     // Check that the last fee operation time DID update, as borrower's debt issuance occured
  //     // after minimum interval had passed
  //     assert.isTrue(lastFeeOpTime_3.gt(lastFeeOpTime_1))
  // })
  //
  // it("openTrove(): reverts if max fee > 100%", async () => {
  //     await assertRevert(borrowerOperations.openTrove(dec(2, 18), dec(10000, 18), A, A, { from: A, value: dec(1000, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
  //     await assertRevert(borrowerOperations.openTrove('1000000000000000001', dec(20000, 18), B, B, { from: B, value: dec(1000, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
  // })
  //
  // it("openTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
  //     await assertRevert(borrowerOperations.openTrove(0, dec(195000, 18), A, A, { from: A, value: dec(1200, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
  //     await assertRevert(borrowerOperations.openTrove(1, dec(195000, 18), A, A, { from: A, value: dec(1000, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
  //     await assertRevert(borrowerOperations.openTrove('4999999999999999', dec(195000, 18), B, B, { from: B, value: dec(1200, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
  // })
  //
  // it("openTrove(): allows max fee < 0.5% in Recovery Mode", async () => {
  //     await contracts.borrowerOperations.openTrove(th._100pct, dec(195000, 18), A, A, { from: A, value: dec(2000, 'ether') })
  //
  //     await priceFeed.setPrice(dec(100, 18))
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //
  //     await contracts.borrowerOperations.openTrove(0, dec(19500, 18), B, B, { from: B, value: dec(3100, 'ether') })
  //     await priceFeed.setPrice(dec(50, 18))
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //     await contracts.borrowerOperations.openTrove(1, dec(19500, 18), C, C, { from: C, value: dec(3100, 'ether') })
  //     await priceFeed.setPrice(dec(25, 18))
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //     await contracts.borrowerOperations.openTrove('4999999999999999', dec(19500, 18), D, D, { from: D, value: dec(3100, 'ether') })
  // })
  //
  // it("openTrove(): reverts if fee exceeds max fee percentage", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     const totalSupply = await zkusdToken.totalSupply()
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     //       actual fee percentage: 0.005000000186264514
  //     // user's max fee percentage:  0.0049999999999999999
  //     let borrowingRate = await troveManager.getBorrowingRate() // expect max(0.5 + 5%, 5%) rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //
  //     const lessThan5pct = '49999999999999999'
  //     await assertRevert(borrowerOperations.openTrove(lessThan5pct, dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")
  //
  //     borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //     // Attempt with maxFee 1%
  //     await assertRevert(borrowerOperations.openTrove(dec(1, 16), dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")
  //
  //     borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //     // Attempt with maxFee 3.754%
  //     await assertRevert(borrowerOperations.openTrove(dec(3754, 13), dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")
  //
  //     borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //     // Attempt with maxFee 1e-16%
  //     await assertRevert(borrowerOperations.openTrove(dec(5, 15), dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")
  // })
  //
  // it("openTrove(): succeeds when fee is less than max fee percentage", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     let borrowingRate = await troveManager.getBorrowingRate() // expect min(0.5 + 5%, 5%) rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //
  //     // Attempt with maxFee > 5%
  //     const moreThan5pct = '50000000000000001'
  //     const tx1 = await contracts.borrowerOperations.openTrove(moreThan5pct, dec(10000, 18), A, A, { from: D, value: dec(100, 'ether') })
  //     assert.isTrue(tx1.receipt.status)
  //
  //     borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //
  //     // Attempt with maxFee = 5%
  //     const tx2 = await contracts.borrowerOperations.openTrove(dec(5, 16), dec(10000, 18), A, A, { from: H, value: dec(100, 'ether') })
  //     assert.isTrue(tx2.receipt.status)
  //
  //     borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //
  //     // Attempt with maxFee 10%
  //     const tx3 = await contracts.borrowerOperations.openTrove(dec(1, 17), dec(10000, 18), A, A, { from: E, value: dec(100, 'ether') })
  //     assert.isTrue(tx3.receipt.status)
  //
  //     borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
  //     assert.equal(borrowingRate, dec(5, 16))
  //
  //     // Attempt with maxFee 37.659%
  //     const tx4 = await contracts.borrowerOperations.openTrove(dec(37659, 13), dec(10000, 18), A, A, { from: F, value: dec(100, 'ether') })
  //     assert.isTrue(tx4.receipt.status)
  //
  //     // Attempt with maxFee 100%
  //     const tx5 = await contracts.borrowerOperations.openTrove(dec(1, 18), dec(10000, 18), A, A, { from: G, value: dec(100, 'ether') })
  //     assert.isTrue(tx5.receipt.status)
  // })
  //
  // it("openTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     // Check baseRate is non-zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_1.gt(toBN('0')))
  //
  //     // 59 minutes pass
  //     th.fastForwardTime(3540, web3.currentProvider)
  //
  //     // Assume Borrower also owns accounts D and E
  //     // Borrower triggers a fee, before decay interval has passed
  //     await openTrove({ extraZKUSDAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
  //
  //     // 1 minute pass
  //     th.fastForwardTime(3540, web3.currentProvider)
  //
  //     // Borrower triggers another fee
  //     await openTrove({ extraZKUSDAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })
  //
  //     // Check base rate has decreased even though Borrower tried to stop it decaying
  //     const baseRate_2 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_2.lt(baseRate_1))
  // })
  //
  // it("openTrove(): borrowing at non-zero base rate sends ZKUSD fee to LQTY staking contract", async () => {
  //     // time fast-forwards 1 year, and multisig stakes 1 LQTY
  //     await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
  //     await lqtyToken.approve(lqtyStaking.address, dec(1, 18), { from: multisig })
  //     await lqtyStaking.stake(dec(1, 18), { from: multisig })
  //
  //     // Check LQTY ZKUSD balance before == 0
  //     const lqtyStaking_ZKUSDBalance_Before = await zkusdToken.balanceOf(lqtyStaking.address)
  //     assert.equal(lqtyStaking_ZKUSDBalance_Before, '0')
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     // Check baseRate is now non-zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_1.gt(toBN('0')))
  //
  //     // 2 hours pass
  //     th.fastForwardTime(7200, web3.currentProvider)
  //
  //     // D opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
  //
  //     // Check LQTY ZKUSD balance after has increased
  //     const lqtyStaking_ZKUSDBalance_After = await zkusdToken.balanceOf(lqtyStaking.address)
  //     assert.isTrue(lqtyStaking_ZKUSDBalance_After.gt(lqtyStaking_ZKUSDBalance_Before))
  // })
  //
  // if (!withProxy) { // TODO: use rawLogs instead of logs
  //     it("openTrove(): borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
  //         // time fast-forwards 1 year, and multisig stakes 1 LQTY
  //         await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
  //         await lqtyToken.approve(lqtyStaking.address, dec(1, 18), { from: multisig })
  //         await lqtyStaking.stake(dec(1, 18), { from: multisig })
  //
  //         await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //         await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //         await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //         await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //         // Artificially make baseRate 5%
  //         await troveManager.setBaseRate(dec(5, 16))
  //         await troveManager.setLastFeeOpTimeToNow()
  //
  //         // Check baseRate is now non-zero
  //         const baseRate_1 = await troveManager.baseRate()
  //         assert.isTrue(baseRate_1.gt(toBN('0')))
  //
  //         // 2 hours pass
  //         th.fastForwardTime(7200, web3.currentProvider)
  //
  //         const D_ZKUSDRequest = toBN(dec(20000, 18))
  //
  //         // D withdraws ZKUSD
  //         const openTroveTx = await contracts.borrowerOperations.openTrove(th._100pct, D_ZKUSDRequest, ZERO_ADDRESS, ZERO_ADDRESS, { from: D, value: dec(200, 'ether') })
  //
  //         const emittedFee = toBN(th.getZKUSDFeeFromZKUSDBorrowingEvent(openTroveTx))
  //         assert.isTrue(toBN(emittedFee).gt(toBN('0')))
  //
  //         const newDebt = (await troveManager.Troves(D))[0]
  //
  //         // Check debt on Trove struct equals drawn debt plus emitted fee
  //         th.assertIsApproximatelyEqual(newDebt, D_ZKUSDRequest.add(emittedFee).add(ZKUSD_GAS_COMPENSATION), 100000)
  //     })
  // }
  //
  // it("openTrove(): Borrowing at non-zero base rate increases the LQTY staking contract ZKUSD fees-per-unit-staked", async () => {
  //     // time fast-forwards 1 year, and multisig stakes 1 LQTY
  //     await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
  //     await lqtyToken.approve(lqtyStaking.address, dec(1, 18), { from: multisig })
  //     await lqtyStaking.stake(dec(1, 18), { from: multisig })
  //
  //     // Check LQTY contract ZKUSD fees-per-unit-staked is zero
  //     const F_ZKUSD_Before = await lqtyStaking.F_ZKUSD()
  //     assert.equal(F_ZKUSD_Before, '0')
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     // Check baseRate is now non-zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_1.gt(toBN('0')))
  //
  //     // 2 hours pass
  //     th.fastForwardTime(7200, web3.currentProvider)
  //
  //     // D opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
  //
  //     // Check LQTY contract ZKUSD fees-per-unit-staked has increased
  //     const F_ZKUSD_After = await lqtyStaking.F_ZKUSD()
  //     assert.isTrue(F_ZKUSD_After.gt(F_ZKUSD_Before))
  // })
  //
  // it("openTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
  //     // time fast-forwards 1 year, and multisig stakes 1 LQTY
  //     await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
  //     await lqtyToken.approve(lqtyStaking.address, dec(1, 18), { from: multisig })
  //     await lqtyStaking.stake(dec(1, 18), { from: multisig })
  //
  //     // Check LQTY Staking contract balance before == 0
  //     const lqtyStaking_ZKUSDBalance_Before = await zkusdToken.balanceOf(lqtyStaking.address)
  //     assert.equal(lqtyStaking_ZKUSDBalance_Before, '0')
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Artificially make baseRate 5%
  //     await troveManager.setBaseRate(dec(5, 16))
  //     await troveManager.setLastFeeOpTimeToNow()
  //
  //     // Check baseRate is non-zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.isTrue(baseRate_1.gt(toBN('0')))
  //
  //     // 2 hours pass
  //     th.fastForwardTime(7200, web3.currentProvider)
  //
  //     // D opens trove
  //     const ZKUSDRequest_D = toBN(dec(40000, 18))
  //     await contracts.borrowerOperations.openTrove(th._100pct, ZKUSDRequest_D, D, D, { from: D, value: dec(500, 'ether') })
  //
  //     // Check LQTY staking ZKUSD balance has increased
  //     const lqtyStaking_ZKUSDBalance_After = await zkusdToken.balanceOf(lqtyStaking.address)
  //     assert.isTrue(lqtyStaking_ZKUSDBalance_After.gt(lqtyStaking_ZKUSDBalance_Before))
  //
  //     // Check D's ZKUSD balance now equals their requested ZKUSD
  //     const ZKUSDBalance_D = await zkusdToken.balanceOf(D)
  //     assert.isTrue(ZKUSDRequest_D.eq(ZKUSDBalance_D))
  // })
  //
  // it("openTrove(): Borrowing at zero base rate changes the LQTY staking contract ZKUSD fees-per-unit-staked", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //
  //     // Check baseRate is zero
  //     const baseRate_1 = await troveManager.baseRate()
  //     assert.equal(baseRate_1, '0')
  //
  //     // 2 hours pass
  //     th.fastForwardTime(7200, web3.currentProvider)
  //
  //     // Check ZKUSD reward per LQTY staked == 0
  //     const F_ZKUSD_Before = await lqtyStaking.F_ZKUSD()
  //     assert.equal(F_ZKUSD_Before, '0')
  //
  //     // A stakes LQTY
  //     await lqtyToken.unprotectedMint(A, dec(100, 18))
  //     await lqtyStaking.stake(dec(100, 18), { from: A })
  //
  //     // D opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
  //
  //     // Check ZKUSD reward per LQTY staked > 0
  //     const F_ZKUSD_After = await lqtyStaking.F_ZKUSD()
  //     assert.isTrue(F_ZKUSD_After.gt(toBN('0')))
  // })
  //
  // it("openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //
  //     const ZKUSDRequest = toBN(dec(10000, 18))
  //     const txC = await contracts.borrowerOperations.openTrove(th._100pct, ZKUSDRequest, ZERO_ADDRESS, ZERO_ADDRESS, { value: dec(100, 'ether'), from: C })
  //     const _ZKUSDFee = toBN(th.getEventArgByName(txC, "ZKUSDBorrowingFeePaid", "_ZKUSDFee"))
  //
  //     const expectedFee = BORROWING_FEE_FLOOR.mul(toBN(ZKUSDRequest)).div(toBN(dec(1, 18)))
  //     assert.isTrue(_ZKUSDFee.eq(expectedFee))
  // })
  //
  // it("openTrove(): reverts when system is in Recovery Mode and ICR < CCR", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     assert.isFalse(await th.checkRecoveryMode(contracts))
  //
  //     // price drops, and Recovery Mode kicks in
  //     await priceFeed.setPrice(dec(105, 18))
  //
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //
  //     // Bob tries to open a trove with 149% ICR during Recovery Mode
  //     try {
  //         const txBob = await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(149, 16)), extraParams: { from: alice } })
  //         assert.isFalse(txBob.receipt.status)
  //     } catch (err) {
  //         assert.include(err.message, "revert")
  //     }
  // })
  //
  // it("openTrove(): reverts when trove ICR < MCR", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     assert.isFalse(await th.checkRecoveryMode(contracts))
  //
  //     // Bob attempts to open a 109% ICR trove in Normal Mode
  //     try {
  //         const txBob = (await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(109, 16)), extraParams: { from: bob } })).tx
  //         assert.isFalse(txBob.receipt.status)
  //     } catch (err) {
  //         assert.include(err.message, "revert")
  //     }
  //
  //     // price drops, and Recovery Mode kicks in
  //     await priceFeed.setPrice(dec(105, 18))
  //
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //
  //     // Bob attempts to open a 109% ICR trove in Recovery Mode
  //     try {
  //         const txBob = await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(109, 16)), extraParams: { from: bob } })
  //         assert.isFalse(txBob.receipt.status)
  //     } catch (err) {
  //         assert.include(err.message, "revert")
  //     }
  // })
  //
  // it("openTrove(): reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
  //     await priceFeed.setPrice(dec(100, 18))
  //
  //     // Alice creates trove with 150% ICR.  System TCR = 150%.
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
  //
  //     const TCR = await th.getTCR(contracts)
  //     assert.equal(TCR, dec(150, 16))
  //
  //     // Bob attempts to open a trove with ICR = 149%
  //     // System TCR would fall below 150%
  //     try {
  //         const txBob = await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(149, 16)), extraParams: { from: bob } })
  //         assert.isFalse(txBob.receipt.status)
  //     } catch (err) {
  //         assert.include(err.message, "revert")
  //     }
  // })
  //
  // it("openTrove(): reverts if trove is already active", async () => {
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: bob } })
  //
  //     try {
  //         const txB_1 = await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(3, 18)), extraParams: { from: bob } })
  //
  //         assert.isFalse(txB_1.receipt.status)
  //     } catch (err) {
  //         assert.include(err.message, 'revert')
  //     }
  //
  //     try {
  //         const txB_2 = await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //         assert.isFalse(txB_2.receipt.status)
  //     } catch (err) {
  //         assert.include(err.message, 'revert')
  //     }
  // })
  //
  // it("openTrove(): Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
  //     // --- SETUP ---
  //     //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: bob } })
  //
  //     const TCR = (await th.getTCR(contracts)).toString()
  //     assert.equal(TCR, '1500000000000000000')
  //
  //     // price drops to 1ETH:100ZKUSD, reducing TCR below 150%
  //     await priceFeed.setPrice('100000000000000000000');
  //     const price = await priceFeed.getPrice()
  //
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //
  //     // Carol opens at 150% ICR in Recovery Mode
  //     const txCarol = (await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: carol } })).tx
  //     assert.isTrue(txCarol.receipt.status)
  //     assert.isTrue(await sortedTroves.contains(carol))
  //
  //     const carol_TroveStatus = await troveManager.getTroveStatus(carol)
  //     assert.equal(carol_TroveStatus, 1)
  //
  //     const carolICR = await troveManager.getCurrentICR(carol, price)
  //     assert.isTrue(carolICR.gt(toBN(dec(150, 16))))
  // })
  //
  // it("openTrove(): Reverts opening a trove with min debt when system is in Recovery Mode", async () => {
  //     // --- SETUP ---
  //     //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: bob } })
  //
  //     const TCR = (await th.getTCR(contracts)).toString()
  //     assert.equal(TCR, '1500000000000000000')
  //
  //     // price drops to 1ETH:100ZKUSD, reducing TCR below 150%
  //     await priceFeed.setPrice('100000000000000000000');
  //
  //     assert.isTrue(await th.checkRecoveryMode(contracts))
  //
  //     await assertRevert(borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT), carol, carol, { from: carol, value: dec(1, 'ether') }))
  // })
  //
  // it("openTrove(): creates a new Trove and assigns the correct collateral and debt amount", async () => {
  //     const debt_Before = await getTroveEntireDebt(alice)
  //     const coll_Before = await getTroveEntireColl(alice)
  //     const status_Before = await troveManager.getTroveStatus(alice)
  //
  //     // check coll and debt before
  //     assert.equal(debt_Before, 0)
  //     assert.equal(coll_Before, 0)
  //
  //     // check non-existent status
  //     assert.equal(status_Before, 0)
  //
  //     const ZKUSDRequest = MIN_NET_DEBT
  //     contracts.borrowerOperations.openTrove(th._100pct, MIN_NET_DEBT, carol, carol, { from: alice, value: dec(100, 'ether') })
  //
  //     // Get the expected debt based on the ZKUSD request (adding fee and liq. reserve on top)
  //     const expectedDebt = ZKUSDRequest
  //         .add(await troveManager.getBorrowingFee(ZKUSDRequest))
  //         .add(ZKUSD_GAS_COMPENSATION)
  //
  //     const debt_After = await getTroveEntireDebt(alice)
  //     const coll_After = await getTroveEntireColl(alice)
  //     const status_After = await troveManager.getTroveStatus(alice)
  //
  //     // check coll and debt after
  //     assert.isTrue(coll_After.gt('0'))
  //     assert.isTrue(debt_After.gt('0'))
  //
  //     assert.isTrue(debt_After.eq(expectedDebt))
  //
  //     // check active status
  //     assert.equal(status_After, 1)
  // })
  //
  // it("openTrove(): adds Trove owner to TroveOwners array", async () => {
  //     const TroveOwnersCount_Before = (await troveManager.getTroveOwnersCount()).toString();
  //     assert.equal(TroveOwnersCount_Before, '0')
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
  //
  //     const TroveOwnersCount_After = (await troveManager.getTroveOwnersCount()).toString();
  //     assert.equal(TroveOwnersCount_After, '1')
  // })
  //
  // it("openTrove(): creates a stake and adds it to total stakes", async () => {
  //     const aliceStakeBefore = await getTroveStake(alice)
  //     const totalStakesBefore = await troveManager.totalStakes()
  //
  //     assert.equal(aliceStakeBefore, '0')
  //     assert.equal(totalStakesBefore, '0')
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     const aliceCollAfter = await getTroveEntireColl(alice)
  //     const aliceStakeAfter = await getTroveStake(alice)
  //     assert.isTrue(aliceCollAfter.gt(toBN('0')))
  //     assert.isTrue(aliceStakeAfter.eq(aliceCollAfter))
  //
  //     const totalStakesAfter = await troveManager.totalStakes()
  //
  //     assert.isTrue(totalStakesAfter.eq(aliceStakeAfter))
  // })
  //
  // it("openTrove(): inserts Trove to Sorted Troves list", async () => {
  //     // Check before
  //     const aliceTroveInList_Before = await sortedTroves.contains(alice)
  //     const listIsEmpty_Before = await sortedTroves.isEmpty()
  //     assert.equal(aliceTroveInList_Before, false)
  //     assert.equal(listIsEmpty_Before, true)
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     // check after
  //     const aliceTroveInList_After = await sortedTroves.contains(alice)
  //     const listIsEmpty_After = await sortedTroves.isEmpty()
  //     assert.equal(aliceTroveInList_After, true)
  //     assert.equal(listIsEmpty_After, false)
  // })
  //
  // it("openTrove(): Increases the activePool ETH and raw ether balance by correct amount", async () => {
  //     const activePool_ETH_Before = await activePool.getETH()
  //     const activePool_RawEther_Before = await web3.eth.getBalance(activePool.address)
  //     assert.equal(activePool_ETH_Before, 0)
  //     assert.equal(activePool_RawEther_Before, 0)
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     const aliceCollAfter = await getTroveEntireColl(alice)
  //
  //     const activePool_ETH_After = await activePool.getETH()
  //     const activePool_RawEther_After = toBN(await web3.eth.getBalance(activePool.address))
  //     assert.isTrue(activePool_ETH_After.eq(aliceCollAfter))
  //     assert.isTrue(activePool_RawEther_After.eq(aliceCollAfter))
  // })
  //
  // it("openTrove(): records up-to-date initial snapshots of L_ETH and L_ZKUSDDebt", async () => {
  //     // --- SETUP ---
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })
  //
  //     // --- TEST ---
  //
  //     // price drops to 1ETH:100ZKUSD, reducing Carol's ICR below MCR
  //     await priceFeed.setPrice(dec(100, 18));
  //
  //     // close Carol's Trove, liquidating her 1 ether and 180ZKUSD.
  //     const liquidationTx = await troveManager.liquidate(carol, { from: owner });
  //     const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //     /* with total stakes = 10 ether, after liquidation, L_ETH should equal 1/10 ether per-ether-staked,
  //      and L_ZKUSD should equal 18 ZKUSD per-ether-staked. */
  //
  //     const L_ETH = await troveManager.L_ETH()
  //     const L_ZKUSD = await troveManager.L_ZKUSDDebt()
  //
  //     assert.isTrue(L_ETH.gt(toBN('0')))
  //     assert.isTrue(L_ZKUSD.gt(toBN('0')))
  //
  //     // Bob opens trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
  //
  //     // Check Bob's snapshots of L_ETH and L_ZKUSD equal the respective current values
  //     const bob_rewardSnapshot = await troveManager.rewardSnapshots(bob)
  //     const bob_ETHrewardSnapshot = bob_rewardSnapshot[0]
  //     const bob_ZKUSDDebtRewardSnapshot = bob_rewardSnapshot[1]
  //
  //     assert.isAtMost(th.getDifference(bob_ETHrewardSnapshot, L_ETH), 1000)
  //     assert.isAtMost(th.getDifference(bob_ZKUSDDebtRewardSnapshot, L_ZKUSD), 1000)
  // })
  //
  // it("openTrove(): allows a user to open a Trove, then close it, then re-open it", async () => {
  //     // Open Troves
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })
  //
  //     // Check Trove is active
  //     const alice_Trove_1 = await troveManager.Troves(alice)
  //     const status_1 = alice_Trove_1[3]
  //     assert.equal(status_1, 1)
  //     assert.isTrue(await sortedTroves.contains(alice))
  //
  //     // to compensate borrowing fees
  //     await zkusdToken.transfer(alice, dec(10000, 18), { from: whale })
  //
  //     // Repay and close Trove
  //     await contracts.borrowerOperations.closeTrove({ from: alice })
  //
  //     // Check Trove is closed
  //     const alice_Trove_2 = await troveManager.Troves(alice)
  //     const status_2 = alice_Trove_2[3]
  //     assert.equal(status_2, 2)
  //     assert.isFalse(await sortedTroves.contains(alice))
  //
  //     // Re-open Trove
  //     await openTrove({ extraZKUSDAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //
  //     // Check Trove is re-opened
  //     const alice_Trove_3 = await troveManager.Troves(alice)
  //     const status_3 = alice_Trove_3[3]
  //     assert.equal(status_3, 1)
  //     assert.isTrue(await sortedTroves.contains(alice))
  // })
  //
  // it("openTrove(): increases the Trove's ZKUSD debt by the correct amount", async () => {
  //     // check before
  //     const alice_Trove_Before = await troveManager.Troves(alice)
  //     const debt_Before = alice_Trove_Before[0]
  //     assert.equal(debt_Before, 0)
  //
  //     await contracts.borrowerOperations.openTrove(th._100pct, await getOpenTroveZKUSDAmount(dec(10000, 18)), alice, alice, { from: alice, value: dec(100, 'ether') })
  //
  //     // check after
  //     const alice_Trove_After = await troveManager.Troves(alice)
  //     const debt_After = alice_Trove_After[0]
  //     th.assertIsApproximatelyEqual(debt_After, dec(10000, 18), 10000)
  // })
  //
  // it("openTrove(): increases ZKUSD debt in ActivePool by the debt of the trove", async () => {
  //     const activePool_ZKUSDDebt_Before = await activePool.getZKUSDDebt()
  //     assert.equal(activePool_ZKUSDDebt_Before, 0)
  //
  //     await openTrove({ extraZKUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
  //     const aliceDebt = await getTroveEntireDebt(alice)
  //     assert.isTrue(aliceDebt.gt(toBN('0')))
  //
  //     const activePool_ZKUSDDebt_After = await activePool.getZKUSDDebt()
  //     assert.isTrue(activePool_ZKUSDDebt_After.eq(aliceDebt))
  // })
  //
  // it("openTrove(): increases user ZKUSDToken balance by correct amount", async () => {
  //     // check before
  //     const alice_ZKUSDTokenBalance_Before = await zkusdToken.balanceOf(alice)
  //     assert.equal(alice_ZKUSDTokenBalance_Before, 0)
  //
  //     await contracts.borrowerOperations.openTrove(th._100pct, dec(10000, 18), alice, alice, { from: alice, value: dec(100, 'ether') })
  //
  //     // check after
  //     const alice_ZKUSDTokenBalance_After = await zkusdToken.balanceOf(alice)
  //     assert.equal(alice_ZKUSDTokenBalance_After, dec(10000, 18))
  // })
  //
  // //  --- getNewICRFromTroveChange - (external wrapper in Tester contract calls internal function) ---
  //
  // describe("getNewICRFromTroveChange() returns the correct ICR", async () => {
  //
  //
  //     // 0, 0
  //     it("collChange = 0, debtChange = 0", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = 0
  //         const debtChange = 0
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
  //         assert.equal(newICR, '2000000000000000000')
  //     })
  //
  //     // 0, +ve
  //     it("collChange = 0, debtChange is positive", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = 0
  //         const debtChange = dec(50, 18)
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
  //         assert.isAtMost(th.getDifference(newICR, '1333333333333333333'), 100)
  //     })
  //
  //     // 0, -ve
  //     it("collChange = 0, debtChange is negative", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = 0
  //         const debtChange = dec(50, 18)
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, false, price)).toString()
  //         assert.equal(newICR, '4000000000000000000')
  //     })
  //
  //     // +ve, 0
  //     it("collChange is positive, debtChange is 0", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = dec(1, 'ether')
  //         const debtChange = 0
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
  //         assert.equal(newICR, '4000000000000000000')
  //     })
  //
  //     // -ve, 0
  //     it("collChange is negative, debtChange is 0", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = dec(5, 17)
  //         const debtChange = 0
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, false, debtChange, true, price)).toString()
  //         assert.equal(newICR, '1000000000000000000')
  //     })
  //
  //     // -ve, -ve
  //     it("collChange is negative, debtChange is negative", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = dec(5, 17)
  //         const debtChange = dec(50, 18)
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, false, debtChange, false, price)).toString()
  //         assert.equal(newICR, '2000000000000000000')
  //     })
  //
  //     // +ve, +ve
  //     it("collChange is positive, debtChange is positive", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = dec(1, 'ether')
  //         const debtChange = dec(100, 18)
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
  //         assert.equal(newICR, '2000000000000000000')
  //     })
  //
  //     // +ve, -ve
  //     it("collChange is positive, debtChange is negative", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = dec(1, 'ether')
  //         const debtChange = dec(50, 18)
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, false, price)).toString()
  //         assert.equal(newICR, '8000000000000000000')
  //     })
  //
  //     // -ve, +ve
  //     it("collChange is negative, debtChange is positive", async () => {
  //         price = await priceFeed.getPrice()
  //         const initialColl = dec(1, 'ether')
  //         const initialDebt = dec(100, 18)
  //         const collChange = dec(5, 17)
  //         const debtChange = dec(100, 18)
  //
  //         const newICR = (await contracts.borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, false, debtChange, true, price)).toString()
  //         assert.equal(newICR, '500000000000000000')
  //     })
  // })
  //
  // // --- getCompositeDebt ---
  //
  // it("getCompositeDebt(): returns debt + gas comp", async () => {
  //     const res1 = await contracts.borrowerOperations.getCompositeDebt('0')
  //     assert.equal(res1, ZKUSD_GAS_COMPENSATION.toString())
  //
  //     const res2 = await contracts.borrowerOperations.getCompositeDebt(dec(90, 18))
  //     th.assertIsApproximatelyEqual(res2, ZKUSD_GAS_COMPENSATION.add(toBN(dec(90, 18))))
  //
  //     const res3 = await contracts.borrowerOperations.getCompositeDebt(dec(24423422357345049, 12))
  //     th.assertIsApproximatelyEqual(res3, ZKUSD_GAS_COMPENSATION.add(toBN(dec(24423422357345049, 12))))
  // })
  //
  // //  --- getNewTCRFromTroveChange  - (external wrapper in Tester contract calls internal function) ---
  //
  // describe("getNewTCRFromTroveChange() returns the correct TCR", async () => {
  //
  //     // 0, 0
  //     it("collChange = 0, debtChange = 0", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //
  //         // --- TEST ---
  //         const collChange = 0
  //         const debtChange = 0
  //         const newTCR = await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price)
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl)).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // 0, +ve
  //     it("collChange = 0, debtChange is positive", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //
  //         // --- TEST ---
  //         const collChange = 0
  //         const debtChange = dec(200, 18)
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl)).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt).add(toBN(debtChange)))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // 0, -ve
  //     it("collChange = 0, debtChange is negative", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //         // --- TEST ---
  //         const collChange = 0
  //         const debtChange = dec(100, 18)
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, false, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl)).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt).sub(toBN(dec(100, 18))))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // +ve, 0
  //     it("collChange is positive, debtChange is 0", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //         // --- TEST ---
  //         const collChange = dec(2, 'ether')
  //         const debtChange = 0
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl).add(toBN(collChange))).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // -ve, 0
  //     it("collChange is negative, debtChange is 0", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //
  //         // --- TEST ---
  //         const collChange = dec(1, 18)
  //         const debtChange = 0
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, false, debtChange, true, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl).sub(toBN(dec(1, 'ether')))).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // -ve, -ve
  //     it("collChange is negative, debtChange is negative", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //
  //         // --- TEST ---
  //         const collChange = dec(1, 18)
  //         const debtChange = dec(100, 18)
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, false, debtChange, false, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl).sub(toBN(dec(1, 'ether')))).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt).sub(toBN(dec(100, 18))))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // +ve, +ve
  //     it("collChange is positive, debtChange is positive", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //
  //         // --- TEST ---
  //         const collChange = dec(1, 'ether')
  //         const debtChange = dec(100, 18)
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl).add(toBN(dec(1, 'ether')))).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt).add(toBN(dec(100, 18))))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // +ve, -ve
  //     it("collChange is positive, debtChange is negative", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //
  //         // --- TEST ---
  //         const collChange = dec(1, 'ether')
  //         const debtChange = dec(100, 18)
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, false, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl).add(toBN(dec(1, 'ether')))).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt).sub(toBN(dec(100, 18))))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  //
  //     // -ve, +ve
  //     it("collChange is negative, debtChange is positive", async () => {
  //         // --- SETUP --- Create a Liquity instance with an Active Pool and pending rewards (Default Pool)
  //         const troveColl = toBN(dec(1000, 'ether'))
  //         const troveTotalDebt = toBN(dec(100000, 18))
  //         const troveZKUSDAmount = await getOpenTroveZKUSDAmount(troveTotalDebt)
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, alice, alice, { from: alice, value: troveColl })
  //         await contracts.borrowerOperations.openTrove(th._100pct, troveZKUSDAmount, bob, bob, { from: bob, value: troveColl })
  //
  //         await priceFeed.setPrice(dec(100, 18))
  //
  //         const liquidationTx = await troveManager.liquidate(bob)
  //         assert.isFalse(await sortedTroves.contains(bob))
  //
  //         const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)
  //
  //         await priceFeed.setPrice(dec(200, 18))
  //         const price = await priceFeed.getPrice()
  //
  //         // --- TEST ---
  //         const collChange = dec(1, 18)
  //         const debtChange = await getNetBorrowingAmount(dec(200, 18))
  //         const newTCR = (await contracts.borrowerOperations.getNewTCRFromTroveChange(collChange, false, debtChange, true, price))
  //
  //         const expectedTCR = (troveColl.add(liquidatedColl).sub(toBN(collChange))).mul(price)
  //             .div(troveTotalDebt.add(liquidatedDebt).add(toBN(debtChange)))
  //
  //         assert.isTrue(newTCR.eq(expectedTCR))
  //     })
  // })
  //
  // if (!withProxy) {
  //     it('closeTrove(): fails if owner cannot receive ETH', async () => {
  //         const nonPayable = await NonPayable.new()
  //
  //         // we need 2 troves to be able to close 1 and have 1 remaining in the system
  //         await contracts.borrowerOperations.openTrove(th._100pct, dec(100000, 18), alice, alice, { from: alice, value: dec(1000, 18) })
  //
  //         // Alice sends ZKUSD to NonPayable so its ZKUSD balance covers its debt
  //         await zkusdToken.transfer(nonPayable.address, dec(10000, 18), {from: alice})
  //
  //         // open trove from NonPayable proxy contract
  //         const _100pctHex = '0xde0b6b3a7640000'
  //         const _1e25Hex = '0xd3c21bcecceda1000000'
  //         const openTroveData = th.getTransactionData('openTrove(uint256,uint256,address,address)', [_100pctHex, _1e25Hex, '0x0', '0x0'])
  //         await nonPayable.forward(borrowerOperations.address, openTroveData, { value: dec(10000, 'ether') })
  //         assert.equal((await troveManager.getTroveStatus(nonPayable.address)).toString(), '1', 'NonPayable proxy should have a trove')
  //         assert.isFalse(await th.checkRecoveryMode(contracts), 'System should not be in Recovery Mode')
  //         // open trove from NonPayable proxy contract
  //         const closeTroveData = th.getTransactionData('closeTrove()', [])
  //         await th.assertRevert(nonPayable.forward(borrowerOperations.address, closeTroveData), 'ActivePool: sending ETH failed')
  //     })
  // }
});
