const ethers = require("ethers");
const caviarAbi = require("./caviar.abi.json");
const pairAbi = require("./pair.abi.json");
const erc721Abi = require("./erc721.abi.json");
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
  const GOERLI_CAVIAR_ADDRESS = "0x6f33e79E7AC6F73fF18ABa8018060B124821C2E2";
  const GOERLI_BAYC_ADDRESS = "0xC1A308D95344716054d4C078831376FC78c4fd72";
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

  // calculate the amount of ETH received when selling 2 BAYCs using xy=k formula
  // 2 BAYC == 2 * 10^18
  const AMOUNT_TO_SELL = ethers.BigNumber.from("2").mul(
    ethers.utils.parseUnits("1", 18)
  );
  const ethReceived = AMOUNT_TO_SELL.mul("997")
    .mul(baseTokenReserves)
    .div(fractionalTokenReserves.mul("1000").add(AMOUNT_TO_SELL.mul("997")));

  console.log("ETH received:", ethers.utils.formatEther(ethReceived), "ETH");

  // create the alchemy instance
  const alchemy = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.ETH_GOERLI,
  });

  // fetch some BAYC NFTs that you currently hold
  const { ownedNfts } = await alchemy.nft.getNftsForOwner(signer.address, {
    contractAddresses: [GOERLI_BAYC_ADDRESS],
  });

  const tokenIdsToSell = [ownedNfts[0].tokenId, ownedNfts[1].tokenId];
  console.log("Token IDs to sell:", tokenIdsToSell);

  const bayc = new ethers.Contract(GOERLI_BAYC_ADDRESS, erc721Abi, signer);
  const approveTx = await bayc.setApprovalForAll(baycEthPairAddress, true);
  console.log("Approve transaction:", approveTx);
  await approveTx.wait();

  const tx = await BaycEthPair.nftSell(tokenIdsToSell, ethReceived, []);
  console.log("Sell transaction:", tx);
};

main();
