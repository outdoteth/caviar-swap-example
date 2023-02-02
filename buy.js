const ethers = require("ethers");
const caviarAbi = require("./caviar.abi.json");
const pairAbi = require("./pair.abi.json");
const { Alchemy, Network } = require("alchemy-sdk");
require("dotenv").config();

const main = async () => {
  // create the provider to connect to the network
  const provider = new ethers.providers.AlchemyProvider(
    "goerli",
    process.env.ALCHEMY_API_KEY
  );

  // create the signer to sign transactions from a wallet
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // create the contract instance for caviar
  const GOERLI_CAVIAR_ADDRESS = "0x15B9D8ba57E67D6683f3E7Bec24A32b98a7cdb6b";
  const GOERLI_BAYC_ADDRESS = "0xc1a308d95344716054d4c078831376fc78c4fd72";
  const Caviar = new ethers.Contract(
    GOERLI_CAVIAR_ADDRESS,
    caviarAbi,
    provider
  );

  // fetch the address of the floor pair for BAYC:ETH
  const baycEthPairAddress = await Caviar.pairs(
    GOERLI_BAYC_ADDRESS, // address of the NFT token
    ethers.constants.AddressZero, // address of the base token (address(0) for ETH)
    ethers.constants.HashZero // hash of the merkle root for valid token ids (hash(0) for no merkle root)
  );

  // create the contract instance for the floor BAYC:ETH pair
  const BaycEthPair = new ethers.Contract(baycEthPairAddress, pairAbi, signer);
  console.log("BAYC:ETH pair address:", baycEthPairAddress);

  // fetch the reserves for the BAYC:ETH pair
  const baseTokenReserves = await BaycEthPair.baseTokenReserves();
  const fractionalTokenReserves = await BaycEthPair.fractionalTokenReserves();

  // calculate the amount of ETH to buy 2 BAYCs using xy=k formula
  // 2 BAYCs == 2 * 1e18 fractional tokens
  const AMOUNT_TO_BUY = ethers.BigNumber.from("2").mul(
    ethers.utils.parseUnits("1", 18)
  );
  const ethCost = AMOUNT_TO_BUY.mul(baseTokenReserves)
    .mul("1000")
    .div(fractionalTokenReserves.sub(AMOUNT_TO_BUY).mul("990"))
    .add("1");

  console.log(
    "ETHER cost to buy 2 BAYCs:",
    ethers.utils.formatEther(ethCost),
    "ETH"
  );

  // create the alchemy instance
  const alchemy = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.ETH_GOERLI,
  });

  // fetch some BAYC NFTs that are currently in the pair contract
  const { ownedNfts } = await alchemy.nft.getNftsForOwner(baycEthPairAddress, {
    contractAddresses: [GOERLI_BAYC_ADDRESS],
  });

  const tokenIdsToBuy = [ownedNfts[0].tokenId, ownedNfts[1].tokenId];
  console.log("Token Ids to buy:", tokenIdsToBuy);

  // deadline for the trade is 60 minutes from now
  const deadline = parseInt((Date.now() + 1000 * 60 * 60) / 1000);
  console.log("Trade deadline unix timestamp:", deadline);

  // submit the transaction to buy the NFTs
  const tx = await BaycEthPair.nftBuy(tokenIdsToBuy, ethCost, deadline, {
    value: ethCost,
  });
  console.log("Transaction:", tx);
};

main();
