const ethers = require("ethers");
const caviarAbi = require("./caviar.abi.json");
const pairAbi = require("./pair.abi.json");
const erc721Abi = require("./erc721.abi.json");
const { Alchemy, Network } = require("alchemy-sdk");
const fetch = require("node-fetch");
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

  // calculate the amount of ETH received when selling 2 BAYCs using xy=k formula
  // 2 BAYC == 2 * 10^18
  const AMOUNT_TO_SELL = ethers.BigNumber.from("2").mul(
    ethers.utils.parseUnits("1", 18)
  );
  const ethReceived = AMOUNT_TO_SELL.mul("990")
    .mul(baseTokenReserves)
    .div(fractionalTokenReserves.mul("1000").add(AMOUNT_TO_SELL.mul("990")));

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

  // deadline for the trade is 60 minutes from now
  const deadline = parseInt((Date.now() + 1000 * 60 * 60) / 1000);
  console.log("Trade deadline unix timestamp:", deadline);

  // fetch the stolen NFT proofs from reservoir
  const reservoirUrl = `https://api.reservoir.tools/oracle/tokens/status/v2?${tokenIdsToSell
    .map((tokenId) => `tokens=${GOERLI_BAYC_ADDRESS}:${tokenId}`)
    .join("&")}`;

  const { messages } = await fetch(reservoirUrl, {
    headers: { "x-api-key": "demo-api-key" }, // you can use your own API key here or the default "demo-api-key"
  }).then((res) => res.json());

  const orderedMessages = tokenIdsToSell.map(
    (tokenId) =>
      messages.find(({ token }) => token.split(":")[1] === tokenId.toString())
        .message
  );

  const tx = await BaycEthPair.nftSell(
    tokenIdsToSell,
    ethReceived,
    deadline,
    [],
    orderedMessages
  );
  console.log("Sell transaction:", tx);
};

main();
