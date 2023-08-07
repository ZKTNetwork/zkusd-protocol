import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { TestHelper as th } from "./TestHelpers";
import { DeployHelpers, deployFunction } from "./DeployHelpers";
import { DefaultPool, NonPayable } from "../typechain-types";

describe("DefaultPool", () => {
  let defaultPool: DefaultPool;
  let nonPayable: NonPayable;
  let mockActivePool: NonPayable;
  let mockTroveManager: NonPayable;
  let dh = new DeployHelpers();
  let owner: Signer;

  before(async () => {
    await dh.runBeforeInitialize();
    owner = dh.testEnv.users[0];
  });

  beforeEach("Deploy contracts", async () => {
    await deployments.fixture(["DeployDefaultPool"]);
    defaultPool = (await ethers.getContract("DefaultPool")) as DefaultPool;
    nonPayable = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    mockTroveManager = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    mockActivePool = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    await defaultPool.setAddresses(
      mockTroveManager.address,
      mockActivePool.address
    );
  });

  it("sendNEONToActivePool(): fails if receiver cannot receive NEON", async () => {
    const amount = th.dec(1, "ether");

    // start pool with `amount`
    const tx = await mockActivePool
      .connect(owner)
      .forward(defaultPool.address, "0x", {
        from: await owner.getAddress(),
        value: BigNumber.from(amount),
      });
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    expect(receipt.status).to.be.eq(1);

    // try to send ether from pool to non-payable
    const sendNEONData = defaultPool.interface.encodeFunctionData(
      "sendNEONToActivePool",
      [BigNumber.from(amount)]
    );
    // await expect(
    //     mockTroveManager
    //         .connect(owner)
    //         .forward(defaultPool.address, sendNEONData, {
    //           from: await owner.getAddress(),
    //         })
    // ).to.be.revertedWith(new RegExp("DefaultPool: sending NEON failed", "i"));
    await expect(
      mockTroveManager
        .connect(owner)
        .forward(defaultPool.address, sendNEONData, {
          from: await owner.getAddress(),
        })
    ).to.be.reverted;
  });
});
