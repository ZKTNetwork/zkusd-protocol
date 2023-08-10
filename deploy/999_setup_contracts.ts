import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, BigNumber, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

const params = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../deploy/params.json")).toString()
)[network.name];

async function priceFeedSetAddresses(priceFeed: Contract) {
  console.log(params.PriceFeedId, params.PriceRouter);
  const setTx0 = await priceFeed.setAddresses(
    params.PriceFeedId,
    params.PriceRouter
  );
  await setTx0.wait();
  console.log("PriceFeed setAddresses finished. ", setTx0.hash);
}

async function sortedTrovesSetParams(
  maxUint256: BigNumber,
  troveManager: Contract,
  borrowerOperations: Contract,
  sortedTroves: Contract
) {
  const setTx1 = await sortedTroves.setParams(
    maxUint256,
    troveManager.address,
    borrowerOperations.address
  );
  await setTx1.wait();
  console.log("SortedTroves setParams finished: ", setTx1.hash);
}

async function troveManagerSetAddresses(
  troveManager: Contract,
  borrowerOperations: Contract,
  activePool: Contract,
  defaultPool: Contract,
  stabilityPool: Contract,
  gasPool: Contract,
  collsurplusPool: Contract,
  priceFeed: Contract,
  zkusdToken: Contract,
  sortedTroves: Contract,
  zkToken: Contract,
  zktStaking: Contract
) {
  const setTx2 = await troveManager.setAddresses(
    borrowerOperations.address,
    activePool.address,
    defaultPool.address,
    stabilityPool.address,
    gasPool.address,
    collsurplusPool.address,
    priceFeed.address,
    zkusdToken.address,
    sortedTroves.address,
    zkToken.address,
    zktStaking.address
  );
  await setTx2.wait();
  console.log("TroveManager setAddresses finished: ", setTx2.hash);
}

async function borrowerOperationsSetAddresses(
  borrowerOperations: Contract,
  troveManager: Contract,
  activePool: Contract,
  defaultPool: Contract,
  stabilityPool: Contract,
  gasPool: Contract,
  collsurplusPool: Contract,
  priceFeed: Contract,
  sortedTroves: Contract,
  zkusdToken: Contract,
  zktStaking: Contract
) {
  const setTx3 = await borrowerOperations.setAddresses(
    troveManager.address,
    activePool.address,
    defaultPool.address,
    stabilityPool.address,
    gasPool.address,
    collsurplusPool.address,
    priceFeed.address,
    sortedTroves.address,
    zkusdToken.address,
    zktStaking.address
  );
  await setTx3.wait();
  console.log("BorrowerOperations setAddresses finished: ", setTx3.hash);
}

async function StabilityPoolSetAddresses(
  stabilityPool: Contract,
  borrowerOperations: Contract,
  troveManager: Contract,
  activePool: Contract,
  zkusdToken: Contract,
  sortedTroves: Contract,
  priceFeed: Contract,
  communityIssuance: Contract,
  deployer: string
) {
  const treasuryAddress =
    params.treasuryAddress === "" ? deployer : params.treasuryAddress;
  const setTx4 = await stabilityPool.setAddresses(
    borrowerOperations.address,
    troveManager.address,
    activePool.address,
    zkusdToken.address,
    sortedTroves.address,
    priceFeed.address,
    communityIssuance.address,
    treasuryAddress
  );
  await setTx4.wait();
  console.log("StabilityPool setAddresses finished: ", setTx4.hash);
}

async function ActivePoolSetAddresses(
  activePool: Contract,
  borrowerOperations: Contract,
  troveManager: Contract,
  stabilityPool: Contract,
  defaultPool: Contract
) {
  const setTx5 = await activePool.setAddresses(
    borrowerOperations.address,
    troveManager.address,
    stabilityPool.address,
    defaultPool.address
  );
  await setTx5.wait();
  console.log("ActivePool setAddresses finished: ", setTx5.hash);
}

async function DefaultPoolSetAddresses(
  defaultPool: Contract,
  troveManager: Contract,
  activePool: Contract
) {
  const setTx6 = await defaultPool.setAddresses(
    troveManager.address,
    activePool.address
  );
  await setTx6.wait();
  console.log("DefaultPool setAddresses finished: ", setTx6.hash);
}

async function CollSurplusPoolSetAddresses(
  collsurplusPool: Contract,
  borrowerOperations: Contract,
  troveManager: Contract,
  activePool: Contract
) {
  const setTx7 = await collsurplusPool.setAddresses(
    borrowerOperations.address,
    troveManager.address,
    activePool.address
  );
  await setTx7.wait();
  console.log("CollSurplusPool setAddresses finished: ", setTx7.hash);
}

async function HintHelpersSetAddresses(
  hintHelpers: Contract,
  sortedTroves: Contract,
  troveManager: Contract
) {
  const setTx8 = await hintHelpers.setAddresses(
    sortedTroves.address,
    troveManager.address
  );
  await setTx8.wait();
  console.log("HintHelpers setAddresses finished: ", setTx8.hash);
}

async function ZKTStakingSetAddresses(
  zktStaking: Contract,
  zkToken: Contract,
  zkusdToken: Contract,
  troveManager: Contract,
  borrowerOperations: Contract,
  activePool: Contract
) {
  const setTx9 = await zktStaking.setAddresses(
    zkToken.address,
    zkusdToken.address,
    troveManager.address,
    borrowerOperations.address,
    activePool.address
  );
  await setTx9.wait();
  console.log("ZKTStaking setAddresses finished: ", setTx9.hash);
}

async function CommunityIssuanceSetAddresses(
  communityIssuance: Contract,
  zkToken: Contract,
  stabilityPool: Contract
) {
  const setTx10 = await communityIssuance.setAddresses(
    zkToken.address,
    stabilityPool.address
  );
  await setTx10.wait();
  console.log("CommunityIssuance setAddresses finished: ", setTx10.hash);
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let priceFeed: Contract;
  if (params.useMock) {
    priceFeed = await ethers.getContract("PriceFeedTestnet");
  } else {
    priceFeed = await ethers.getContract("WitnetPriceFeed");
  }
  const defaultPool = await ethers.getContract("DefaultPool");
  const collsurplusPool = await ethers.getContract("CollSurplusPool");
  const activePool = await ethers.getContract("ActivePool");
  const stabilityPool = await ethers.getContract("StabilityPool");
  const sortedTroves = await ethers.getContract("SortedTroves");
  const borrowerOperations = await ethers.getContract("BorrowerOperations");
  const troveManager = await ethers.getContract("TroveManager");
  const communityIssuance = await ethers.getContract("CommunityIssuance");
  const zkToken = await ethers.getContract("ZKToken");
  const zktStaking = await ethers.getContract("ZKTStaking");
  const zkusdToken = await ethers.getContract("ZKUSDToken");
  const gasPool = await ethers.getContract("GasPool");
  const hintHelpers = await ethers.getContract("HintHelpers");

  // PriceFeed
  await priceFeedSetAddresses(priceFeed);

  // SortedTroves
  await sortedTrovesSetParams(
    ethers.constants.MaxUint256,
    troveManager,
    borrowerOperations,
    sortedTroves
  );

  // TroveManager
  await troveManagerSetAddresses(
    troveManager,
    borrowerOperations,
    activePool,
    defaultPool,
    stabilityPool,
    gasPool,
    collsurplusPool,
    priceFeed,
    zkusdToken,
    sortedTroves,
    zkToken,
    zktStaking
  );

  // BorrowerOperations
  await borrowerOperationsSetAddresses(
    borrowerOperations,
    troveManager,
    activePool,
    defaultPool,
    stabilityPool,
    gasPool,
    collsurplusPool,
    priceFeed,
    sortedTroves,
    zkusdToken,
    zktStaking
  );

  // StabilityPool
  await StabilityPoolSetAddresses(
    stabilityPool,
    borrowerOperations,
    troveManager,
    activePool,
    zkusdToken,
    sortedTroves,
    priceFeed,
    communityIssuance,
    deployer
  );

  // ActivePool
  await ActivePoolSetAddresses(
    activePool,
    borrowerOperations,
    troveManager,
    stabilityPool,
    defaultPool
  );

  // DefaultPool
  await DefaultPoolSetAddresses(defaultPool, troveManager, activePool);

  // CollsurPlusPool
  await CollSurplusPoolSetAddresses(
    collsurplusPool,
    borrowerOperations,
    troveManager,
    activePool
  );

  // HintHelpers
  await HintHelpersSetAddresses(hintHelpers, sortedTroves, troveManager);

  // ZKTStaking
  await ZKTStakingSetAddresses(
    zktStaking,
    zkToken,
    zkusdToken,
    troveManager,
    borrowerOperations,
    activePool
  );

  // CommunityIssuance
  await CommunityIssuanceSetAddresses(
    communityIssuance,
    zkToken,
    stabilityPool
  );
};

export default func;
func.id = "setup_contract_addresses";
func.tags = ["SetupContractAddresses"];
func.dependencies = [
  "DeployPriceFeed",
  "DeployCollSurplusPool",
  "DeployActivePool",
  "DeploySortedTroves",
  "DeployGasPool",
  "DeployHintHelpers",
  "DeployUniPool",
    "DeployMultiTroveGetter"
];
