import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (network.name === "hardhat") return;

  const priceFeed = await ethers.getContract("PythPriceFeed");
  const defaultPool = await ethers.getContract("DefaultPool");
  const collsurplusPool = await ethers.getContract("CollSurplusPool");
  const activePool = await ethers.getContract("ActivePool");
  const stabilityPool = await ethers.getContract("StabilityPool");
  const sortedTroves = await ethers.getContract("SortedTroves");
  const borrowerOperations = await ethers.getContract("BorrowerOperations");
  const troveManager = await ethers.getContract("TroveManager");
  const lockupContractFactory = await ethers.getContract(
    "LockupContractFactory"
  );
  const communityIssuance = await ethers.getContract("CommunityIssuance");
  const zkToken = await ethers.getContract("ZKToken");
  const zktStaking = await ethers.getContract("ZKTStaking");
  const zkusdToken = await ethers.getContract("ZKUSDToken");
  const gasPool = await ethers.getContract("GasPool");
  const hintHelpers = await ethers.getContract("HintHelpers");
  const uniPool = await ethers.getContract("Unipool");
};

export default func;
func.id = "show_contract_addresses";
func.tags = ["ShowContractAddresses"];
func.dependencies = [
  "DeployPythPriceFeed",
  "DeployCollSurplusPool",
  "DeployActivePool",
  "DeploySortedTroves",
  "DeployRimeToken",
  "DeployZKUSDToken",
  "DeployGasPool",
  "DeployHintHelpers",
  "DeployUniPool",
];
