import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { TestHelper as th, ContractType } from "./TestHelpers";
import { DeployHelpers, deployFunction } from "./DeployHelpers";
import {
  ZKUSDToken,
  SortedTroves,
  SortedTrovesTester,
} from "../typechain-types";

const dec = th.dec;
const toBN = th.toBN;

const address = async (account: Signer) => {
  return await account.getAddress();
};

const assertSortedListIsOrdered = async (contracts: ContractType) => {
  const price = await contracts.priceFeedTestnet.getPrice();
  let trove = await contracts.sortedTroves.getLast();
  while (trove !== (await contracts.sortedTroves.getFirst())) {
    // Get the adjacent upper trove ("prev" moves up the list, from lower ICR -> higher ICR)
    const prevTrove = await contracts.sortedTroves.getPrev(trove);
    const troveICR = await contracts.troveManager.getCurrentICR(trove, price);
    const prevTroveICR = await contracts.troveManager.getCurrentICR(
      prevTrove,
      price
    );
    assert.isTrue(prevTroveICR.gte(troveICR));
    const troveNICR = await contracts.troveManager.getNominalICR(trove);
    const prevTroveNICR = await contracts.troveManager.getNominalICR(prevTrove);
    assert.isTrue(prevTroveNICR.gte(troveNICR));
    trove = prevTrove;
  }
};

describe("SortedTroves", async () => {
  let zkusdToken: ZKUSDToken;
  let contracts: ContractType;
  let dh: DeployHelpers = new DeployHelpers();
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  let dennis: Signer;
  let erin: Signer;
  let defaulter_1: Signer;
  let whale: Signer;
  let A: Signer,
    B: Signer,
    C: Signer,
    D: Signer,
    E: Signer,
    F: Signer,
    G: Signer,
    H: Signer,
    I: Signer,
    J: Signer;

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

  before(async () => {
    await dh.runBeforeInitialize();
    alice = dh.testEnv.users[0];
    bob = dh.testEnv.users[1];
    carol = dh.testEnv.users[2];
    dennis = dh.testEnv.users[3];
    erin = dh.testEnv.users[4];
    defaulter_1 = dh.testEnv.users[5];
    A = dh.testEnv.users[6];
    B = dh.testEnv.users[7];
    C = dh.testEnv.users[8];
    D = dh.testEnv.users[9];
    E = dh.testEnv.users[10];
    F = dh.testEnv.users[11];
    G = dh.testEnv.users[12];
    H = dh.testEnv.users[13];
    I = dh.testEnv.users[14];
    J = dh.testEnv.users[15];
    whale = dh.testEnv.users[16];
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
  });

  it("contains(): returns true for addresses that have opened troves", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(2000, 18)),
      extraParams: { from: address(carol) },
    });

    // Confirm trove statuses became active
    assert.equal((await contracts.troveManager.Troves(address(alice)))[3], 1);
    assert.equal((await contracts.troveManager.Troves(address(bob)))[3], 1);
    assert.equal((await contracts.troveManager.Troves(address(carol)))[3], 1);

    // Check sorted list contains troves
    assert.isTrue(await contracts.sortedTroves.contains(address(alice)));
    assert.isTrue(await contracts.sortedTroves.contains(address(bob)));
    assert.isTrue(await contracts.sortedTroves.contains(address(carol)));
  });

  it("contains(): returns false for addresses that have not opened troves", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(2000, 18)),
      extraParams: { from: address(carol) },
    });

    // Confirm troves have non-existent status
    assert.equal((await contracts.troveManager.Troves(address(dennis)))[3], 0);
    assert.equal((await contracts.troveManager.Troves(address(erin)))[3], 0);

    // Check sorted list do not contain troves
    assert.isFalse(await contracts.sortedTroves.contains(address(dennis)));
    assert.isFalse(await contracts.sortedTroves.contains(address(erin)));
  });

  it("contains(): returns false for addresses that opened and then closed a trove", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(1000, 18)),
      extraZKUSDAmount: toBN(dec(3000, 18)),
      extraParams: { from: await whale.getAddress() },
    });

    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(2000, 18)),
      extraParams: { from: address(carol) },
    });

    // to compensate borrowing fees
    await zkusdToken.connect(whale).transfer(address(alice), dec(1000, 18));
    await zkusdToken.connect(whale).transfer(address(bob), dec(1000, 18));
    await zkusdToken.connect(whale).transfer(address(carol), dec(1000, 18));

    // A, B, C close troves
    await contracts.borrowerOperations.connect(alice).closeTrove();
    await contracts.borrowerOperations.connect(bob).closeTrove();
    await contracts.borrowerOperations.connect(carol).closeTrove();

    // Confirm trove statuses became closed
    assert.equal((await contracts.troveManager.Troves(address(alice)))[3], 2);
    assert.equal((await contracts.troveManager.Troves(address(bob)))[3], 2);
    assert.equal((await contracts.troveManager.Troves(address(carol)))[3], 2);

    // Check sorted list does not contain troves
    assert.isFalse(await contracts.sortedTroves.contains(address(alice)));
    assert.isFalse(await contracts.sortedTroves.contains(address(bob)));
    assert.isFalse(await contracts.sortedTroves.contains(address(carol)));
  });

  // true for addresses that opened -> closed -> opened a trove
  it("contains(): returns true for addresses that opened, closed and then re-opened a trove", async () => {
    await openTrove(whale, {
      ICR: toBN(dec(1000, 18)),
      extraZKUSDAmount: toBN(dec(3000, 18)),
      extraParams: { from: address(whale) },
    });

    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(20, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(2000, 18)),
      extraParams: { from: address(carol) },
    });

    // to compensate borrowing fees
    await zkusdToken.connect(whale).transfer(address(alice), dec(1000, 18));
    await zkusdToken.connect(whale).transfer(address(bob), dec(1000, 18));
    await zkusdToken.connect(whale).transfer(address(carol), dec(1000, 18));

    // A, B, C close troves
    await contracts.borrowerOperations.connect(alice).closeTrove();
    await contracts.borrowerOperations.connect(bob).closeTrove();
    await contracts.borrowerOperations.connect(carol).closeTrove();

    // Confirm trove statuses became closed
    assert.equal((await contracts.troveManager.Troves(address(alice)))[3], 2);
    assert.equal((await contracts.troveManager.Troves(address(bob)))[3], 2);
    assert.equal((await contracts.troveManager.Troves(address(carol)))[3], 2);

    await openTrove(alice, {
      ICR: toBN(dec(1000, 16)),
      extraParams: { from: address(alice) },
    });
    await openTrove(bob, {
      ICR: toBN(dec(2000, 18)),
      extraParams: { from: address(bob) },
    });
    await openTrove(carol, {
      ICR: toBN(dec(3000, 18)),
      extraParams: { from: address(carol) },
    });

    // Confirm trove statuses became open again
    assert.equal((await contracts.troveManager.Troves(address(alice)))[3], 1);
    assert.equal((await contracts.troveManager.Troves(address(bob)))[3], 1);
    assert.equal((await contracts.troveManager.Troves(address(carol)))[3], 1);

    // Check sorted list does  contain troves
    assert.isTrue(await contracts.sortedTroves.contains(address(alice)));
    assert.isTrue(await contracts.sortedTroves.contains(address(bob)));
    assert.isTrue(await contracts.sortedTroves.contains(address(carol)));
  });

  // false when list size is 0
  it("contains(): returns false when there are no troves in the system", async () => {
    assert.isFalse(await contracts.sortedTroves.contains(address(alice)));
    assert.isFalse(await contracts.sortedTroves.contains(address(bob)));
    assert.isFalse(await contracts.sortedTroves.contains(address(carol)));
  });

  // true when list size is 1 and the trove the only one in system
  it("contains(): true when list size is 1 and the trove the only one in system", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });

    assert.isTrue(await contracts.sortedTroves.contains(address(alice)));
  });

  // false when list size is 1 and trove is not in the system
  it("contains(): false when list size is 1 and trove is not in the system", async () => {
    await openTrove(alice, {
      ICR: toBN(dec(150, 16)),
      extraParams: { from: address(alice) },
    });

    assert.isFalse(await contracts.sortedTroves.contains(address(bob)));
  });

  // --- getMaxSize ---

  it("getMaxSize(): Returns the maximum list size", async () => {
    const max = await contracts.sortedTroves.getMaxSize();
    assert.equal(max.toHexString(), th.maxBytes32);
  });

  // --- findInsertPosition ---

  it("Finds the correct insert position given two addresses that loosely bound the correct position", async () => {
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));

    // NICR sorted in descending order
    await openTrove(whale, {
      ICR: toBN(dec(500, 18)),
      extraParams: { from: address(whale) },
    });
    await openTrove(A, {
      ICR: toBN(dec(10, 18)),
      extraParams: { from: address(A) },
    });
    await openTrove(B, {
      ICR: toBN(dec(5, 18)),
      extraParams: { from: address(B) },
    });
    await openTrove(C, {
      ICR: toBN(dec(250, 16)),
      extraParams: { from: address(C) },
    });
    await openTrove(D, {
      ICR: toBN(dec(166, 16)),
      extraParams: { from: address(D) },
    });
    await openTrove(E, {
      ICR: toBN(dec(125, 16)),
      extraParams: { from: address(E) },
    });

    // Expect a trove with NICR 300% to be inserted between B and C
    const targetNICR = dec(3, 18);

    // Pass addresses that loosely bound the right postiion
    const hints = await contracts.sortedTroves.findInsertPosition(
      targetNICR,
      address(A),
      address(E)
    );

    // Expect the exact correct insert hints have been returned
    assert.equal(hints[0], await address(B));
    assert.equal(hints[1], await address(C));

    // The price doesn’t affect the hints
    await contracts.priceFeedTestnet.setPrice(dec(500, 18));
    const hints2 = await contracts.sortedTroves.findInsertPosition(
      targetNICR,
      address(A),
      address(E)
    );

    // Expect the exact correct insert hints have been returned
    assert.equal(hints2[0], await address(B));
    assert.equal(hints2[1], await address(C));
  });
});

describe("SortedTrovesTester", () => {
  let sortedTroves: SortedTroves;
  let sortedTrovesTester: SortedTrovesTester;
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  before(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();
    sortedTroves = (await deployFunction(
      "SortedTroves",
      deployer
    )) as SortedTroves;
    sortedTrovesTester = (await deployFunction(
      "SortedTrovesTester",
      deployer
    )) as SortedTrovesTester;
    await sortedTrovesTester.setSortedTroves(sortedTroves.address);
    await sortedTroves.setParams(
      2,
      sortedTrovesTester.address,
      sortedTrovesTester.address
    );
  });
  beforeEach(async () => {
    sortedTroves = (await deployFunction(
      "SortedTroves",
      deployer
    )) as SortedTroves;
    sortedTrovesTester = (await deployFunction(
      "SortedTrovesTester",
      deployer
    )) as SortedTrovesTester;
    await sortedTrovesTester.setSortedTroves(sortedTroves.address);
    await sortedTroves.setParams(
      2,
      sortedTrovesTester.address,
      sortedTrovesTester.address
    );
  });
  it("insert(): fails if list is full", async () => {
    await sortedTrovesTester.insert(
      address(alice),
      1,
      address(alice),
      address(alice)
    );
    await sortedTrovesTester.insert(
      address(bob),
      1,
      address(alice),
      address(alice)
    );
    await expect(
      sortedTrovesTester.insert(
        address(carol),
        1,
        address(alice),
        address(alice)
      )
    ).to.be.revertedWith("SortedTroves: List is full");
  });
  it("insert(): fails if list already contains the node", async () => {
    await sortedTrovesTester.insert(
      address(alice),
      1,
      address(alice),
      address(alice)
    );
    await expect(
      sortedTrovesTester.insert(
        address(alice),
        1,
        address(alice),
        address(alice)
      )
    ).to.be.revertedWith("SortedTroves: List already contains the node");
  });
  it("insert(): fails if id is zero", async () => {
    await expect(
      sortedTrovesTester.insert(
        ethers.constants.AddressZero,
        1,
        address(alice),
        address(alice)
      )
    ).to.be.revertedWith("SortedTroves: Id cannot be zero");
  });
  it("insert(): fails if NICR is zero", async () => {
    await expect(
      sortedTrovesTester.insert(
        address(alice),
        0,
        address(alice),
        address(alice)
      )
    ).to.be.revertedWith("SortedTroves: NICR must be positive");
  });
  it("remove(): fails if id is not in the list", async () => {
    await expect(sortedTrovesTester.remove(address(alice))).to.be.revertedWith(
      "SortedTroves: List does not contain the id"
    );
  });
  it("reInsert(): fails if list doesn’t contain the node", async () => {
    await expect(
      sortedTrovesTester.reInsert(
        address(alice),
        1,
        address(alice),
        address(alice)
      )
    ).to.be.revertedWith("SortedTroves: List does not contain the id");
  });
  it("reInsert(): fails if new NICR is zero", async () => {
    await sortedTrovesTester.insert(
      address(alice),
      1,
      address(alice),
      address(alice)
    );
    assert.isTrue(
      await sortedTroves.contains(address(alice)),
      "list should contain element"
    );
    await expect(
      sortedTrovesTester.reInsert(
        address(alice),
        0,
        address(alice),
        address(alice)
      )
    ).to.be.revertedWith("SortedTroves: NICR must be positive");
    assert.isTrue(
      await sortedTroves.contains(address(alice)),
      "list should contain element"
    );
  });
  it("findInsertPosition(): No prevId for hint - ascend list starting from nextId, result is after the tail", async () => {
    await sortedTrovesTester.insert(
      address(alice),
      1,
      address(alice),
      address(alice)
    );
    const pos = await sortedTroves.findInsertPosition(
      1,
      th.ZERO_ADDRESS,
      address(alice)
    );
    assert.equal(
      pos[0],
      await address(alice),
      "prevId result should be nextId param"
    );
    assert.equal(pos[1], th.ZERO_ADDRESS, "nextId result should be zero");
  });
});
