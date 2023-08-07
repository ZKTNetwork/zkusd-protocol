import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import {
  TestHelper as th,
  ContractType,
  assertTrue,
  assertFalse,
  isAtMost,
  assertEqual,
} from "./TestHelpers";
import { DeployHelpers } from "./DeployHelpers";
import {
  ActivePool,
  CollSurplusPool,
  CommunityIssuance,
  DefaultPool,
  LockupContractFactory,
  ZKTStaking,
  ZKToken,
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

  let ZKUSD_GAS_COMPENSATION;
  let MIN_NET_DEBT;
  let BORROWING_FEE_FLOOR;

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

  it("addColl(): reverts when top-up would leave trove with ICR < MCR", async () => {
    // alice creates a Trove and adds first collateral
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });
    await openTrove(dh.testEnv.users[2], {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: bob },
    });

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    assertFalse(await contracts.troveManager.checkRecoveryMode(price));
    assertTrue(
      (await contracts.troveManager.getCurrentICR(alice, price)).lt(
        toBN(dec(110, 16))
      )
    );

    const collTopUp = 1; // 1 wei top up

    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[1])
        .addColl(alice, alice, {
          from: alice,
          value: collTopUp,
        })
    ).to.be.revertedWith(
      "Operation: An operation that would result in ICR < MCR is not permitted"
    );
  });

  it("addColl(): Increases the activePool NEON and raw ether balance by correct amount", async () => {
    const { collateral: aliceColl } = await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });

    const activePool_NEON_Before = await activePool.getNEON();
    const activePool_RawConflux_Before = toBN(
      await ethers.provider.getBalance(activePool.address)
    );

    assertTrue(activePool_NEON_Before.eq(aliceColl));
    assertTrue(activePool_RawConflux_Before.eq(aliceColl));

    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .addColl(alice, alice, {
        from: alice,
        value: dec(1, "ether"),
      });

    const activePool_NEON_After = await activePool.getNEON();
    const activePool_RawConflux_After = toBN(
      await ethers.provider.getBalance(activePool.address)
    );
    assertTrue(activePool_NEON_After.eq(aliceColl.add(toBN(dec(1, "ether")))));
    assertTrue(
      activePool_RawConflux_After.eq(aliceColl.add(toBN(dec(1, "ether"))))
    );
  });

  it("addColl(), active Trove: adds the correct collateral amount to the Trove", async () => {
    // alice creates a Trove and adds first collateral
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });

    const alice_Trove_Before = await contracts.troveManager.Troves(alice);
    const coll_before = alice_Trove_Before[1];
    const status_Before = alice_Trove_Before[3];

    // check status before
    assertEqual(status_Before, 1);

    // Alice adds second collateral
    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .addColl(alice, alice, {
        from: alice,
        value: dec(1, "ether"),
      });

    const alice_Trove_After = await contracts.troveManager.Troves(alice);
    const coll_After = alice_Trove_After[1];
    const status_After = alice_Trove_After[3];

    // check coll increases by correct amount,and status remains active
    assertTrue(coll_After.eq(coll_before.add(toBN(dec(1, "ether")))));
    assertEqual(status_After, 1);
  });

  it("addColl(), active Trove: Trove is in sortedList before and after", async () => {
    // alice creates a Trove and adds first collateral
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });

    // check Alice is in list before
    const aliceTroveInList_Before = await contracts.sortedTroves.contains(
      alice
    );
    const listIsEmpty_Before = await contracts.sortedTroves.isEmpty();
    assertEqual(aliceTroveInList_Before, true);
    assertEqual(listIsEmpty_Before, false);

    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .addColl(alice, alice, {
        from: alice,
        value: dec(1, "ether"),
      });

    // check Alice is still in list after
    const aliceTroveInList_After = await contracts.sortedTroves.contains(alice);
    const listIsEmpty_After = await contracts.sortedTroves.isEmpty();
    assertEqual(aliceTroveInList_After, true);
    assertEqual(listIsEmpty_After, false);
  });

  it("addColl(), active Trove: updates the stake and updates the total stakes", async () => {
    //  Alice creates initial Trove with 1 ether
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });

    const alice_Trove_Before = await contracts.troveManager.Troves(alice);
    const alice_Stake_Before = alice_Trove_Before[2];
    const totalStakes_Before = await contracts.troveManager.totalStakes();

    assertTrue(totalStakes_Before.eq(alice_Stake_Before));

    // Alice tops up Trove collateral with 2 ether
    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .addColl(alice, alice, {
        from: alice,
        value: dec(2, "ether"),
      });

    // Check stake and total stakes get updated
    const alice_Trove_After = await contracts.troveManager.Troves(alice);
    const alice_Stake_After = alice_Trove_After[2];
    const totalStakes_After = await contracts.troveManager.totalStakes();

    assertTrue(
      alice_Stake_After.eq(alice_Stake_Before.add(toBN(dec(2, "ether"))))
    );
    assertTrue(
      totalStakes_After.eq(totalStakes_Before.add(toBN(dec(2, "ether"))))
    );
  });

  it("addColl(), active Trove: applies pending rewards and updates user's L_NEON, L_ZKUSDDebt snapshots", async () => {
    // --- SETUP ---

    const { collateral: aliceCollBefore, totalDebt: aliceDebtBefore } =
      await openTrove(dh.testEnv.users[1], {
        extraZKUSDAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
    const { collateral: bobCollBefore, totalDebt: bobDebtBefore } =
      await openTrove(dh.testEnv.users[2], {
        extraZKUSDAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
    await openTrove(dh.testEnv.users[3], {
      extraZKUSDAmount: toBN(dec(5000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: carol },
    });

    // --- TEST ---

    // price drops to 1NEON:100ZKUSD, reducing Carol's ICR below MCR
    await contracts.priceFeedTestnet.setPrice(toBN("100000000000000000000"));

    // Liquidate Carol's Trove,
    const tx = await contracts.troveManager
      .connect(dh.testEnv.users[0])
      .liquidate(carol, { from: owner });

    assertFalse(await contracts.sortedTroves.contains(carol));

    const L_NEON = await contracts.troveManager.L_NEON();
    const L_ZKUSDDebt = await contracts.troveManager.L_ZKUSDDebt();

    // check Alice and Bob's reward snapshots are zero before they alter their Troves
    const alice_rewardSnapshot_Before =
      await contracts.troveManager.rewardSnapshots(alice);
    const alice_NEONrewardSnapshot_Before = alice_rewardSnapshot_Before[0];
    const alice_ZKUSDDebtRewardSnapshot_Before = alice_rewardSnapshot_Before[1];

    const bob_rewardSnapshot_Before =
      await contracts.troveManager.rewardSnapshots(bob);
    const bob_NEONrewardSnapshot_Before = bob_rewardSnapshot_Before[0];
    const bob_ZKUSDDebtRewardSnapshot_Before = bob_rewardSnapshot_Before[1];

    assertEqual(alice_NEONrewardSnapshot_Before, 0);
    assertEqual(alice_ZKUSDDebtRewardSnapshot_Before, 0);
    assertEqual(bob_NEONrewardSnapshot_Before, 0);
    assertEqual(bob_ZKUSDDebtRewardSnapshot_Before, 0);

    const alicePendingNEONReward =
      await contracts.troveManager.getPendingNEONReward(alice);
    const bobPendingNEONReward =
      await contracts.troveManager.getPendingNEONReward(bob);
    const alicePendingZKUSDDebtReward =
      await contracts.troveManager.getPendingZKUSDDebtReward(alice);
    const bobPendingZKUSDDebtReward =
      await contracts.troveManager.getPendingZKUSDDebtReward(bob);
    for (const reward of [
      alicePendingNEONReward,
      bobPendingNEONReward,
      alicePendingZKUSDDebtReward,
      bobPendingZKUSDDebtReward,
    ]) {
      assertTrue(reward.gt(toBN("0")));
    }

    // Alice and Bob top up their Troves
    const aliceTopUp = toBN(dec(5, "ether"));
    const bobTopUp = toBN(dec(1, "ether"));

    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .addColl(alice, alice, {
        from: alice,
        value: aliceTopUp,
      });
    await contracts.borrowerOperations
      .connect(dh.testEnv.users[2])
      .addColl(bob, bob, {
        from: bob,
        value: bobTopUp,
      });

    // Check that both alice and Bob have had pending rewards applied in addition to their top-ups.
    const aliceNewColl = await getTroveEntireColl(alice);
    const aliceNewDebt = await getTroveEntireDebt(alice);
    const bobNewColl = await getTroveEntireColl(bob);
    const bobNewDebt = await getTroveEntireDebt(bob);

    assertTrue(
      aliceNewColl.eq(
        aliceCollBefore.add(alicePendingNEONReward).add(aliceTopUp)
      )
    );
    assertTrue(
      aliceNewDebt.eq(aliceDebtBefore.add(alicePendingZKUSDDebtReward))
    );
    assertTrue(
      bobNewColl.eq(bobCollBefore.add(bobPendingNEONReward).add(bobTopUp))
    );
    assertTrue(bobNewDebt.eq(bobDebtBefore.add(bobPendingZKUSDDebtReward)));

    /* Check that both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
     to the latest values of L_NEON and L_ZKUSDDebt */
    const alice_rewardSnapshot_After =
      await contracts.troveManager.rewardSnapshots(alice);
    const alice_NEONrewardSnapshot_After = alice_rewardSnapshot_After[0];
    const alice_ZKUSDDebtRewardSnapshot_After = alice_rewardSnapshot_After[1];

    const bob_rewardSnapshot_After =
      await contracts.troveManager.rewardSnapshots(bob);
    const bob_NEONrewardSnapshot_After = bob_rewardSnapshot_After[0];
    const bob_ZKUSDDebtRewardSnapshot_After = bob_rewardSnapshot_After[1];

    isAtMost(th.getDifference(alice_NEONrewardSnapshot_After, L_NEON), 100);
    isAtMost(
      th.getDifference(alice_ZKUSDDebtRewardSnapshot_After, L_ZKUSDDebt),
      100
    );
    isAtMost(th.getDifference(bob_NEONrewardSnapshot_After, L_NEON), 100);
    isAtMost(
      th.getDifference(bob_ZKUSDDebtRewardSnapshot_After, L_ZKUSDDebt),
      100
    );
  });
  it("addColl(), reverts if trove is non-existent or closed", async () => {
    // A, B open troves
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });
    await openTrove(dh.testEnv.users[2], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: bob },
    });

    // Carol attempts to add collateral to her non-existent trove
    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[3])
        .addColl(carol, carol, { from: carol, value: dec(1, "ether") })
    ).to.be.revertedWith("Operation: Trove does not exist or is closed");

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    // Bob gets liquidated
    await contracts.troveManager.liquidate(bob);

    assertFalse(await contracts.sortedTroves.contains(bob));

    // Bob attempts to add collateral to his closed trove
    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[2])
        .addColl(bob, bob, { from: bob, value: dec(1, "ether") })
    ).to.be.revertedWith("Operation: Trove does not exist or is closed");
  });

  it("addColl(): can add collateral in Recovery Mode", async () => {
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });
    const aliceCollBefore = await getTroveEntireColl(alice);
    assertFalse(await th.checkRecoveryMode(contracts));

    await contracts.priceFeedTestnet.setPrice(toBN("105000000000000000000"));

    assertTrue(await th.checkRecoveryMode(contracts));

    const collTopUp = toBN(dec(1, "ether"));
    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .addColl(alice, alice, {
        from: alice,
        value: collTopUp,
      });

    // Check Alice's collateral
    const aliceCollAfter = (await contracts.troveManager.Troves(alice))[1];
    assertTrue(aliceCollAfter.eq(aliceCollBefore.add(collTopUp)));
  });

  // --- withdrawColl() ---

  it("withdrawColl(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
    // alice creates a Trove and adds first collateral
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });
    await openTrove(dh.testEnv.users[2], {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: bob },
    });

    // Price drops
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    const price = await contracts.priceFeedTestnet.getPrice();

    assertFalse(await contracts.troveManager.checkRecoveryMode(price));
    assertTrue(
      (await contracts.troveManager.getCurrentICR(alice, price)).lt(
        toBN(dec(110, 16))
      )
    );

    const collWithdrawal = 1; // 1 wei withdrawal

    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[1])
        .withdrawColl(1, alice, alice, { from: alice })
    ).to.be.revertedWith(
      "Operation: An operation that would result in ICR < MCR is not permitted"
    );
  });

  // reverts when calling address does not have active trove
  it("withdrawColl(): reverts when calling address does not have active trove", async () => {
    await openTrove(dh.testEnv.users[1], {
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });
    await openTrove(dh.testEnv.users[2], {
      extraZKUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: bob },
    });

    // Bob successfully withdraws some coll
    await contracts.borrowerOperations
      .connect(dh.testEnv.users[2])
      .withdrawColl(dec(100, "finney"), bob, bob, { from: bob });

    // Carol with no active trove attempts to withdraw
    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[3])
        .withdrawColl(dec(1, "ether"), carol, carol, { from: carol })
    ).to.be.revertedWith("Operation: Trove does not exist or is closed");
  });

  it("withdrawColl(): reverts when system is in Recovery Mode", async () => {
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });
    await openTrove(dh.testEnv.users[2], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: bob },
    });

    assertFalse(await th.checkRecoveryMode(contracts));

    // Withdrawal possible when recoveryMode == false
    await contracts.borrowerOperations
      .connect(dh.testEnv.users[1])
      .withdrawColl(1000, alice, alice, {
        from: alice,
      });

    await contracts.priceFeedTestnet.setPrice(toBN("105000000000000000000"));

    assertTrue(await th.checkRecoveryMode(contracts));

    //Check withdrawal impossible when recoveryMode == true
    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[2])
        .withdrawColl(1000, bob, bob, { from: bob })
    ).to.be.revertedWith(
      "Operation: Collateral withdrawal not permitted Recovery Mode"
    );
  });

  it("withdrawColl(): reverts when requested NEON withdrawal is > the trove's collateral", async () => {
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: alice },
    });
    await openTrove(dh.testEnv.users[2], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: bob },
    });
    await openTrove(dh.testEnv.users[3], {
      ICR: toBN(dec(2, 18)),
      extraParams: { from: carol },
    });

    const carolColl = await getTroveEntireColl(carol);
    const bobColl = await getTroveEntireColl(bob);
    // Carol withdraws exactly all her collateral
    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[3])
        .withdrawColl(carolColl, carol, carol, { from: carol })
    ).to.be.revertedWith(
      "Operation: An operation that would result in ICR < MCR is not permitted"
    );

    // Bob attempts to withdraw 1 wei more than his collateral
    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[2])
        .withdrawColl(bobColl.add(toBN(1)), bob, bob, { from: bob })
    ).to.be.reverted;
  });

  it("withdrawColl(): reverts when withdrawal would bring the user's ICR < MCR", async () => {
    await openTrove(dh.testEnv.users[5], {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });

    await openTrove(dh.testEnv.users[2], {
      ICR: toBN(dec(11, 17)),
      extraParams: { from: bob },
    }); // 110% ICR

    // Bob attempts to withdraws 1 wei, Which would leave him with < 110% ICR.

    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[2])
        .withdrawColl(1, bob, bob, { from: bob })
    ).to.be.revertedWith(
      "Operation: An operation that would result in ICR < MCR is not permitted"
    );
  });
  it("withdrawColl(): reverts if system is in Recovery Mode", async () => {
    // --- SETUP ---

    // A and B open troves at 150% ICR
    await openTrove(dh.testEnv.users[2], {
      ICR: toBN(dec(15, 17)),
      extraParams: { from: bob },
    });
    await openTrove(dh.testEnv.users[1], {
      ICR: toBN(dec(15, 17)),
      extraParams: { from: alice },
    });

    const TCR = (await th.getTCR(contracts)).toString();
    assertEqual(TCR, "1500000000000000000");

    // --- TEST ---

    // price drops to 1NEON:150ZKUSD, reducing TCR below 150%
    await contracts.priceFeedTestnet.setPrice("150000000000000000000");

    //Alice tries to withdraw collateral during Recovery Mode
    await expect(
      contracts.borrowerOperations
        .connect(dh.testEnv.users[1])
        .withdrawColl("1", alice, alice, { from: alice })
    ).to.be.reverted;
  });
});
