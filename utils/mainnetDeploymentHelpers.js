const fs = require('fs')

const ZERO_ADDRESS = '0x' + '0'.repeat(40)
const maxBytes32 = '0x' + 'f'.repeat(64)

class MainnetDeploymentHelper {
  constructor(configParams, deployerWallet) {
    this.configParams = configParams
    this.deployerWallet = deployerWallet
    this.hre = require("hardhat")
  }

  loadPreviousDeployment() {
    let previousDeployment = {}
    if (fs.existsSync(this.configParams.OUTPUT_FILE)) {
      console.log(`Loading previous deployment...`)
      previousDeployment = require('../' + this.configParams.OUTPUT_FILE)
    }

    return previousDeployment
  }

  saveDeployment(deploymentState) {
    const deploymentStateJSON = JSON.stringify(deploymentState, null, 2)
    fs.writeFileSync(this.configParams.OUTPUT_FILE, deploymentStateJSON)

  }
  // --- Deployer methods ---

  async getFactory(name) {
    const factory = await ethers.getContractFactory(name, this.deployerWallet)
    return factory
  }

  async sendAndWaitForTransaction(txPromise) {
    const tx = await txPromise
    const minedTx = await ethers.provider.waitForTransaction(tx.hash, this.configParams.TX_CONFIRMATIONS)

    return minedTx
  }

  async loadOrDeploy(factory, name, deploymentState, params=[]) {
    if (deploymentState[name] && deploymentState[name].address) {
      console.log(`Using previously deployed ${name} contract at address ${deploymentState[name].address}`)
      return new ethers.Contract(
        deploymentState[name].address,
        factory.interface,
        this.deployerWallet
      );
    }

    const contract = await factory.deploy(...params, {gasPrice: this.configParams.GAS_PRICE})
    await this.deployerWallet.provider.waitForTransaction(contract.deployTransaction.hash, this.configParams.TX_CONFIRMATIONS)

    deploymentState[name] = {
      address: contract.address,
      txHash: contract.deployTransaction.hash
    }

    this.saveDeployment(deploymentState)

    return contract
  }

  async deployLiquityCoreMainnet(tellorMasterAddr, deploymentState) {
    // Get contract factories
    const priceFeedFactory = await this.getFactory("PriceFeed")
    const sortedTrovesFactory = await this.getFactory("SortedTroves")
    const troveManagerFactory = await this.getFactory("TroveManager")
    const activePoolFactory = await this.getFactory("ActivePool")
    const stabilityPoolFactory = await this.getFactory("StabilityPool")
    const gasPoolFactory = await this.getFactory("GasPool")
    const defaultPoolFactory = await this.getFactory("DefaultPool")
    const collSurplusPoolFactory = await this.getFactory("CollSurplusPool")
    const borrowerOperationsFactory = await this.getFactory("BorrowerOperations")
    const hintHelpersFactory = await this.getFactory("HintHelpers")
    const zkusdTokenFactory = await this.getFactory("ZKUSDToken")
    const tellorCallerFactory = await this.getFactory("TellorCaller")

    // Deploy txs
    const priceFeed = await this.loadOrDeploy(priceFeedFactory, 'priceFeed', deploymentState)
    const sortedTroves = await this.loadOrDeploy(sortedTrovesFactory, 'sortedTroves', deploymentState)
    const troveManager = await this.loadOrDeploy(troveManagerFactory, 'troveManager', deploymentState)
    const activePool = await this.loadOrDeploy(activePoolFactory, 'activePool', deploymentState)
    const stabilityPool = await this.loadOrDeploy(stabilityPoolFactory, 'stabilityPool', deploymentState)
    const gasPool = await this.loadOrDeploy(gasPoolFactory, 'gasPool', deploymentState)
    const defaultPool = await this.loadOrDeploy(defaultPoolFactory, 'defaultPool', deploymentState)
    const collSurplusPool = await this.loadOrDeploy(collSurplusPoolFactory, 'collSurplusPool', deploymentState)
    const borrowerOperations = await this.loadOrDeploy(borrowerOperationsFactory, 'borrowerOperations', deploymentState)
    const hintHelpers = await this.loadOrDeploy(hintHelpersFactory, 'hintHelpers', deploymentState)
    const tellorCaller = await this.loadOrDeploy(tellorCallerFactory, 'tellorCaller', deploymentState, [tellorMasterAddr])

    const zkusdTokenParams = [
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address
    ]
    const zkusdToken = await this.loadOrDeploy(
      zkusdTokenFactory,
      'zkusdToken',
      deploymentState,
      zkusdTokenParams
    )

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('priceFeed', deploymentState)
      await this.verifyContract('sortedTroves', deploymentState)
      await this.verifyContract('troveManager', deploymentState)
      await this.verifyContract('activePool', deploymentState)
      await this.verifyContract('stabilityPool', deploymentState)
      await this.verifyContract('gasPool', deploymentState)
      await this.verifyContract('defaultPool', deploymentState)
      await this.verifyContract('collSurplusPool', deploymentState)
      await this.verifyContract('borrowerOperations', deploymentState)
      await this.verifyContract('hintHelpers', deploymentState)
      await this.verifyContract('tellorCaller', deploymentState, [tellorMasterAddr])
      await this.verifyContract('zkusdToken', deploymentState, zkusdTokenParams)
    }

    const coreContracts = {
      priceFeed,
      zkusdToken,
      sortedTroves,
      troveManager,
      activePool,
      stabilityPool,
      gasPool,
      defaultPool,
      collSurplusPool,
      borrowerOperations,
      hintHelpers,
      tellorCaller
    }
    return coreContracts
  }

  async deployZKTContractsMainnet(bountyAddress, lpRewardsAddress, multisigAddress, deploymentState) {
    const zktStakingFactory = await this.getFactory("ZKTStaking")
    const lockupContractFactory_Factory = await this.getFactory("LockupContractFactory")
    const communityIssuanceFactory = await this.getFactory("CommunityIssuance")
    const zkTokenFactory = await this.getFactory("ZKToken")

    const zktStaking = await this.loadOrDeploy(zktStakingFactory, 'zktStaking', deploymentState)
    const lockupContractFactory = await this.loadOrDeploy(lockupContractFactory_Factory, 'lockupContractFactory', deploymentState)
    const communityIssuance = await this.loadOrDeploy(communityIssuanceFactory, 'communityIssuance', deploymentState)

    // Deploy ZKT Token, passing Community Issuance and Factory addresses to the constructor
    const zkTokenParams = [
      communityIssuance.address,
      zktStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    ]
    const zkToken = await this.loadOrDeploy(
      zkTokenFactory,
      'zkToken',
      deploymentState,
      zkTokenParams
    )

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('zktStaking', deploymentState)
      await this.verifyContract('lockupContractFactory', deploymentState)
      await this.verifyContract('communityIssuance', deploymentState)
      await this.verifyContract('zkToken', deploymentState, zkTokenParams)
    }

    const ZKTContracts = {
      zktStaking,
      lockupContractFactory,
      communityIssuance,
      zkToken
    }
    return ZKTContracts
  }

  async deployUnipoolMainnet(deploymentState) {
    const unipoolFactory = await this.getFactory("Unipool")
    const unipool = await this.loadOrDeploy(unipoolFactory, 'unipool', deploymentState)

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('unipool', deploymentState)
    }

    return unipool
  }

  async deployMultiTroveGetterMainnet(liquityCore, deploymentState) {
    const multiTroveGetterFactory = await this.getFactory("MultiTroveGetter")
    const multiTroveGetterParams = [
      liquityCore.troveManager.address,
      liquityCore.sortedTroves.address
    ]
    const multiTroveGetter = await this.loadOrDeploy(
      multiTroveGetterFactory,
      'multiTroveGetter',
      deploymentState,
      multiTroveGetterParams
    )

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('multiTroveGetter', deploymentState, multiTroveGetterParams)
    }

    return multiTroveGetter
  }
  // --- Connector methods ---

  async isOwnershipRenounced(contract) {
    const owner = await contract.owner()
    return owner == ZERO_ADDRESS
  }
  // Connect contracts to their dependencies
  async connectCoreContractsMainnet(contracts, ZKTContracts, chainlinkProxyAddress) {
    const gasPrice = this.configParams.GAS_PRICE
    // Set ChainlinkAggregatorProxy and TellorCaller in the PriceFeed
    await this.isOwnershipRenounced(contracts.priceFeed) ||
      await this.sendAndWaitForTransaction(contracts.priceFeed.setAddresses(chainlinkProxyAddress, contracts.tellorCaller.address, {gasPrice}))

    // set TroveManager addr in SortedTroves
    await this.isOwnershipRenounced(contracts.sortedTroves) ||
      await this.sendAndWaitForTransaction(contracts.sortedTroves.setParams(
        maxBytes32,
        contracts.troveManager.address,
        contracts.borrowerOperations.address, 
	{gasPrice}
      ))

    // set contracts in the Trove Manager
    await this.isOwnershipRenounced(contracts.troveManager) ||
      await this.sendAndWaitForTransaction(contracts.troveManager.setAddresses(
        contracts.borrowerOperations.address,
        contracts.activePool.address,
        contracts.defaultPool.address,
        contracts.stabilityPool.address,
        contracts.gasPool.address,
        contracts.collSurplusPool.address,
        contracts.priceFeed.address,
        contracts.zkusdToken.address,
        contracts.sortedTroves.address,
        ZKTContracts.zkToken.address,
        ZKTContracts.zktStaking.address,
	{gasPrice}
      ))

    // set contracts in BorrowerOperations 
    await this.isOwnershipRenounced(contracts.borrowerOperations) ||
      await this.sendAndWaitForTransaction(contracts.borrowerOperations.setAddresses(
        contracts.troveManager.address,
        contracts.activePool.address,
        contracts.defaultPool.address,
        contracts.stabilityPool.address,
        contracts.gasPool.address,
        contracts.collSurplusPool.address,
        contracts.priceFeed.address,
        contracts.sortedTroves.address,
        contracts.zkusdToken.address,
        ZKTContracts.zktStaking.address,
	{gasPrice}
      ))

    // set contracts in the Pools
    await this.isOwnershipRenounced(contracts.stabilityPool) ||
      await this.sendAndWaitForTransaction(contracts.stabilityPool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.activePool.address,
        contracts.zkusdToken.address,
        contracts.sortedTroves.address,
        contracts.priceFeed.address,
        ZKTContracts.communityIssuance.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(contracts.activePool) ||
      await this.sendAndWaitForTransaction(contracts.activePool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.stabilityPool.address,
        contracts.defaultPool.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(contracts.defaultPool) ||
      await this.sendAndWaitForTransaction(contracts.defaultPool.setAddresses(
        contracts.troveManager.address,
        contracts.activePool.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(contracts.collSurplusPool) ||
      await this.sendAndWaitForTransaction(contracts.collSurplusPool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.activePool.address,
	{gasPrice}
      ))

    // set contracts in HintHelpers
    await this.isOwnershipRenounced(contracts.hintHelpers) ||
      await this.sendAndWaitForTransaction(contracts.hintHelpers.setAddresses(
        contracts.sortedTroves.address,
        contracts.troveManager.address,
	{gasPrice}
      ))
  }

  async connectZKTContractsMainnet(ZKTContracts) {
    const gasPrice = this.configParams.GAS_PRICE
    // Set ZKToken address in LCF
    await this.isOwnershipRenounced(ZKTContracts.zktStaking) ||
      await this.sendAndWaitForTransaction(ZKTContracts.lockupContractFactory.setZKTokenAddress(ZKTContracts.zkToken.address, {gasPrice}))
  }

  async connectZKTContractsToCoreMainnet(ZKTContracts, coreContracts) {
    const gasPrice = this.configParams.GAS_PRICE
    await this.isOwnershipRenounced(ZKTContracts.zktStaking) ||
      await this.sendAndWaitForTransaction(ZKTContracts.zktStaking.setAddresses(
        ZKTContracts.zkToken.address,
        coreContracts.zkusdToken.address,
        coreContracts.troveManager.address, 
        coreContracts.borrowerOperations.address,
        coreContracts.activePool.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(ZKTContracts.communityIssuance) ||
      await this.sendAndWaitForTransaction(ZKTContracts.communityIssuance.setAddresses(
        ZKTContracts.zkToken.address,
        coreContracts.stabilityPool.address,
	{gasPrice}
      ))
  }

  async connectUnipoolMainnet(uniPool, ZKTContracts, ZKUSDWETHPairAddr, duration) {
    const gasPrice = this.configParams.GAS_PRICE
    await this.isOwnershipRenounced(uniPool) ||
      await this.sendAndWaitForTransaction(uniPool.setParams(ZKTContracts.zkToken.address, ZKUSDWETHPairAddr, duration, {gasPrice}))
  }

  // --- Verify on Ethrescan ---
  async verifyContract(name, deploymentState, constructorArguments=[]) {
    if (!deploymentState[name] || !deploymentState[name].address) {
      console.error(`  --> No deployment state for contract ${name}!!`)
      return
    }
    if (deploymentState[name].verification) {
      console.log(`Contract ${name} already verified`)
      return
    }

    try {
      await this.hre.run("verify:verify", {
        address: deploymentState[name].address,
        constructorArguments,
      })
    } catch (error) {
      // if it was already verified, it’s like a success, so let’s move forward and save it
      if (error.name != 'NomicLabsHardhatPluginError') {
        console.error(`Error verifying: ${error.name}`)
        console.error(error)
        return
      }
    }

    deploymentState[name].verification = `${this.configParams.ETHERSCAN_BASE_URL}/${deploymentState[name].address}#code`

    this.saveDeployment(deploymentState)
  }

  // --- Helpers ---

  async logContractObjects (contracts) {
    console.log(`Contract objects addresses:`)
    for ( const contractName of Object.keys(contracts)) {
      console.log(`${contractName}: ${contracts[contractName].address}`);
    }
  }
}

module.exports = MainnetDeploymentHelper
