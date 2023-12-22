import * as dotenv from 'dotenv';
import Moralis from "moralis";
import { Contract, Provider } from 'ethers-multicall';
import { BigNumber, ethers } from "ethers";
import { pairAbi } from '../abi/pair';
import { tokenAbi } from '../abi/token';

import fetch from "cross-fetch";
import gql from "graphql-tag";
import { ApolloClient } from "apollo-boost";
import { InMemoryCache } from "apollo-boost";
import { createHttpLink } from "apollo-link-http";
import { formatEther, formatUnits } from 'viem';

const provider = new ethers.providers.JsonRpcProvider(`https://rpc.lokibuilder.xyz/wallet`);
const ethcallProvider = new Provider(provider);

dotenv.config();

const subgraph = {
    '3': "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3"
}

const stable_coin = {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usdc",
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "usdt"
}

const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

const APPOLO = (version) => {
    const defaultOptions = {
        watchQuery: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'ignore',
        },
        query: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'all',
        }
    }
    return new ApolloClient({
        link: createHttpLink({
            uri: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
            fetch: fetch
        }),
        cache: new InMemoryCache(),
        defaultOptions: defaultOptions
    });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const get_token_usd_price = async (address, chain) => {
    try {
        const response = await Moralis.EvmApi.token.getTokenPrice({
            address,
            chain
        })
        return response.raw.usdPrice;
    } catch (err) {
        return 0;
    }
}

const get_token_eth_price = async (address, chain) => {
    try {
        const response = await Moralis.EvmApi.token.getTokenPrice({
            address,
            chain
        })
        return formatUnits(response.raw.nativePrice.value, response.raw.nativePrice.decimals);
    } catch (err) {
        return 0;
    }
}

const get_eth_price = async () => {
    try {
        const response = await Moralis.EvmApi.token.getTokenPrice({
            address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            chain: "0x1"
        })
        return response.raw.usdPrice;
    } catch (err) {
        console.log(`err::`, err);
        return 0;
    }
}

const get_eth_balance = async (address, blockNumber) => {
    let response = await Moralis.EvmApi.balance.getNativeBalance({
        address: address,
        chain: "0x1",
        toBlock: blockNumber
    });
    return response.raw.balance;
}


const getSwapV2 = async (trader_address) => {

    await ethcallProvider.init();
    const from = Math.floor(Date.now() / 1000 - 24 * 3600 * 30);
    const planRateLimit = 150; // find throughput based on your plan here: https://moralis.io/pricing/#compare
    const endpointRateLimit = 5; // find endpoint rate limit here: https://docs.moralis.io/web3-data-api/evm/reference/compute-units-cu#rate-limit-cost
    let allowedRequests = planRateLimit / endpointRateLimit;
    let cursor = null;
    let result = [];

    do {
        if (allowedRequests <= 0) {
            // wait 1.1 seconds
            await new Promise((r) => setTimeout(r, 1100));
            allowedRequests = planRateLimit / endpointRateLimit;
        }

        let resp = await Moralis.EvmApi.transaction.getWalletTransactionsVerbose({
            address: trader_address,
            chain: "0x1",
            fromDate: new Date(from * 1000),
            limit: 100,
            cursor: cursor
        })

        // console.log(`On page ${resp.pagination.page}`);
        // console.log(`result::`, resp.result.length);
        result.push(...resp.toJSON().result);
        cursor = resp.pagination.cursor;
        allowedRequests--;

    } while (cursor != '' && cursor != null)

    let logList = [];
    let addressList = [];
    let transList1 = [];
    let transList2 = [];

    // let resp = await ethcallProvider.all([contract.token0()]);
    let tmp;
    result.forEach((item) => {
        item.logs.forEach((log) => {
            if (log.topic0 == '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822') {
                // addressList.push(log.address);
                logList.push(log);

            }
        })
    })

    logList.forEach((log) => {

        let contract = new Contract(log.address, pairAbi);
        transList1.push(contract.token0());
        transList2.push(contract.token1());

    })

    let transListRes1 = await ethcallProvider.all(transList1);
    let transListRes2 = await ethcallProvider.all(transList2);

    let symbolList1 = []
    let symbolList2 = []
    let symbolListRes1 = []
    let symbolListRes2 = []
    let decimalList1 = []
    let decimalList2 = []
    let decimalListRes1 = []
    let decimalListRes2 = []

    // console.log(`logList::`, logList[0]);
    console.log(123)

    logList.map((log, key) => {

        if (transListRes1[key] && transListRes2[key]) {
            let contract1 = new Contract(transListRes1[key], tokenAbi);
            let contract2 = new Contract(transListRes2[key], tokenAbi);
            symbolList1.push(contract1.symbol())
            symbolList2.push(contract2.symbol())
            decimalList1.push(contract1.decimals())
            decimalList2.push(contract2.decimals())
        }
    })

    symbolListRes1 = await ethcallProvider.all(symbolList1)
    symbolListRes2 = await ethcallProvider.all(symbolList2)

    decimalListRes1 = await ethcallProvider.all(decimalList1)
    decimalListRes2 = await ethcallProvider.all(decimalList2)

    // console.log(`symbolListRes1::`, symbolListRes1)
    // console.log(`symbolListRes2::`, symbolListRes2)

    let ethPriceUsd = await get_eth_price();

    let swap = [];

    logList.forEach((item, key) => {
        if (transListRes1[key].toLowerCase() == weth || transListRes2[key].toLowerCase() == weth) {
            let totalUsdAmount = 0;
            let amount0In = BigInt('0x' + item.data.slice(2).slice(0, 64))
            let amount1In = BigInt('0x' + item.data.slice(2).slice(64, 128))
            let amount0Out = BigInt('0x' + item.data.slice(2).slice(128, 192))
            let amount1Out = BigInt('0x' + item.data.slice(2).slice(192, 256))

            if (transListRes1[key].toLowerCase() == weth) {
                totalUsdAmount = Number(formatUnits((amount0In > 0 ? amount0In : amount0Out), decimalListRes1[key]) * ethPriceUsd);
            } else {
                totalUsdAmount = Number(formatUnits((amount1In > 0 ? amount1In : amount1Out), decimalListRes2[key]) * ethPriceUsd);
            }

            swap.push({
                from: trader_address,
                timestamp: new Date(item.block_timestamp).getTime() / 1000,
                transaction: {
                    blockNumber: item.block_number,
                    swaps: [{
                        id: item.transaction_hash
                    }]
                },
                pair: {
                    token0: {
                        id: transListRes1[key],
                        symbol: symbolListRes1[key]
                    },
                    token1: {
                        id: transListRes2[key],
                        symbol: symbolListRes2[key]
                    }
                },
                amount0In: formatUnits(amount0In, decimalListRes1[key]).toString(),
                amount1In: formatUnits(amount1In, decimalListRes2[key]).toString(),
                amount0Out: formatUnits(amount0Out, decimalListRes1[key]).toString(),
                amount1Out: formatUnits(amount1Out, decimalListRes2[key]).toString(),
                amountUSD: totalUsdAmount
            })
        }
    })

    return swap;
}

const getSwapV3 = async (trader_address) => {
    const from = Math.floor(Date.now() / 1000 - 24 * 3600 * 30);
    let skip = 0
    const step = 1000
    let swaps = []
    try {
        let data0;
        do {
            const querySwapV3 = `
            query {
                swaps(
                    first:${step},
                    skip:${skip},
                    orderBy: timestamp, 
                    orderDirection: desc,
                    where:{
                        origin:"${trader_address}",
                        timestamp_gt:${from}
                    }
                ) {
                    origin
                    timestamp
                    transaction{
                        blockNumber
                        swaps{
                            id
                            
                        }
                    }                
                    token0 {
                      id
                      symbol
                    }
                    token1 {
                      id
                      symbol
                    }
                    amount0
                    amount1
                    amountUSD
                 }
                }
            
            `
            const appoloClient = APPOLO(3);
            const query = gql(querySwapV3)
            data0 = await appoloClient.query({
                query: query
            })

            if (data0?.data?.swaps.length > 0) {
                data0?.data?.swaps.map((s) => {
                    // if (version == 2) {
                    //     if (s.pair.token0.id.toLowerCase() == weth ||
                    //         s.pair.token1.id.toLowerCase() == weth
                    //     ) swaps.push(s)

                    // } else {
                    if (s.token0.id.toLowerCase() == weth ||
                        s.token1.id.toLowerCase() == weth
                    ) swaps.push(s)

                    // }
                }
                );
            }
            skip = skip + step;
            await delay(100)
        } while (data0?.data?.swaps.length > 0)
    } catch (e) {
        console.log(e)
    }
    return swaps;
}

const get_portfolio = async (address) => {

    try {

        /**
         *  get token balances of wallet
         */

        let response = await Moralis.EvmApi.token.getWalletTokenBalances({
            address: address,
            chain: "0x1"
        })

        let tokenList = [];
        let tokenListFinal = [];

        let tokenPriceList = [];
        let addressList = [];
        // let block_number = (await provider.getBlock()).number;
        response.raw.forEach((item) => {
            if (!item.possible_spam) {
                tokenList.push({
                    token_address: item.token_address,
                    symbol: item.symbol,
                    decimals: item.decimals,
                    balance: item.balance
                })
                // tokenPriceList.push(get_token_usd_price(item.token_address, "0x1"));
                addressList.push({
                    token_address: item.token_address,
                    to_block: 16314545
                });
            }
        })

        const options = {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                'X-API-Key': process.env.moralis_key
            },
            body: JSON.stringify({
                "tokens": addressList
            })
        };

        let res = await fetch('https://deep-index.moralis.io/api/v2.2/erc20/prices?chain=eth&include=percent_change', options)
        let priceList = await res.json();

        tokenList.forEach((item, key) => {
            tokenListFinal.push({
                ...item,
                amount: (Number(formatUnits(BigInt(item.balance), item.decimals)) * (priceList[key]  ? priceList[key].usdPrice : 0 ))
            })
        })

        /**
         *  get Eth balace of wallet
         */
        let ethPrice = await get_eth_price();
        let response1 = await Moralis.EvmApi.balance.getNativeBalance({
            address: address,
            chain: "0x1",
        })

        if (Number(formatEther(response1.raw.balance)) > 0) {
            tokenListFinal.push({
                token_address: '',
                symbol: 'ETH',
                decimals: 18,
                balance: response1.raw.balance,
                amount: (Number(formatEther(response1.raw.balance)) * ethPrice)
            })
        }

        let sumUsd = 0;
        tokenListFinal.map((item) => {
            sumUsd = sumUsd + item.amount;
        })


        return {
            sumUsd,
            ethBalance: Number(formatEther(response1.raw.balance))
        }

    } catch (err) {
        console.log(`get portfolio err::`, err);
        return [];

    }
}

const getTrading = async (trader_address, version) => {

    let books;
    if (version == 2) {
        books = await getSwapV2(trader_address);
    } else {
        books = await getSwapV3(trader_address);
    }

    let tokens = {}
    let positions = {},
        trades = [],
        totalProfit = 0,
        totalProfit_roi = 0,
        winCounter = 0,
        lossCounter = 0,
        winRate = 0,
        totalBuy = 0,
        initEth = 0;

    for (let i = books.length - 1; i >= 0; i--) {
        const tr = books[i];
        let tradingAmount, usdAmount, ethAmount, side, rate, base_symbol, symbol_name, ethRate, position;
        usdAmount = Number(tr.amountUSD);

        if (version == 2) {

            base_symbol = tr.pair.token0.id.toLowerCase() != weth ? tr.pair.token0.id : tr.pair.token1.id;
            symbol_name = tr.pair.token0.id.toLowerCase() != weth ? tr.pair.token0.symbol : tr.pair.token1.symbol;
            if (tr.pair.token0.id == base_symbol) {//token0

                if (Number(tr.amount1Out) > 0) {
                    side = 'sell';
                    tradingAmount = tr.amount0In;
                    ethAmount = tr.amount1Out;
                } else {
                    side = 'buy';
                    tradingAmount = tr.amount0Out;
                    ethAmount = tr.amount1In;
                }
            } else {//token1
                if (Number(tr.amount0Out) > 0) {
                    side = 'sell';
                    tradingAmount = tr.amount1In;
                    ethAmount = tr.amount0Out;
                } else {
                    side = 'buy';
                    tradingAmount = tr.amount1Out;
                    ethAmount = tr.amount0In;
                }
            }
        }
        else {
            base_symbol = tr.token0.id.toLowerCase() != weth ? tr.token0.id : tr.token1.id;
            symbol_name = tr.token0.id.toLowerCase() != weth ? tr.token0.symbol : tr.token1.symbol;
            if (tr.token0.id == base_symbol) {//token0
                if (tr.amount0 > 0) {
                    side = 'sell';
                    tradingAmount = tr.amount0;
                    ethAmount = -tr.amount1;
                } else {
                    side = 'buy';
                    tradingAmount = -tr.amount0;
                    ethAmount = tr.amount1;
                }
            } else {//token1
                if (tr.amount1 > 0) {
                    side = 'sell';
                    tradingAmount = tr.amount1;
                    ethAmount = -tr.amount0;
                } else {
                    side = 'buy';
                    tradingAmount = -tr.amount1;
                    ethAmount = tr.amount0;
                }
            }

        }

        ethAmount = Number(ethAmount);
        tradingAmount = Number(tradingAmount);
        rate = ethAmount / tradingAmount;
        ethRate = usdAmount / ethAmount;

        position = positions[symbol_name]

        if (stable_coin[base_symbol]) continue;

        if (side == "buy") {
            totalBuy++;
            let cum_quote = (position?.balance) ? position.avg * position.balance : 0;
            if (initEth == 0) {
                initEth = await get_eth_balance(trader_address, "0x" + (tr.transaction.blockNumber - 1).toString(16));
            }
            let newBalance = (position?.balance)
                ? position.balance + tradingAmount
                : tradingAmount;

            let avg = (cum_quote + ethAmount) / newBalance;

            positions[symbol_name] = {
                open_time: tr.timestamp,
                balance: newBalance,
                avg,
                token: base_symbol,
                tokenName: symbol_name
            };

        }
        else {
            if (position?.balance && position?.balance > tradingAmount) {
                const open_price = position.avg;
                const open_time = position.open_time
                const close_time = tr.timestamp
                const close_price = rate;
                const amount = tradingAmount;

                const profit = (close_price - open_price) * amount;

                if (profit > 0) {
                    winCounter++;
                } else {
                    lossCounter++;
                }
                const profit_roi = (close_price - open_price) * amount / initEth;
                totalProfit = totalProfit + profit;
                totalProfit_roi = totalProfit_roi + profit_roi;
                const newBalance = position.balance - tradingAmount;

                trades.push({
                    symbol_name,
                    open_time,
                    close_time,
                    open_price,
                    close_price,
                    amount,
                    profit,
                    profit_roi,
                    closemode: newBalance <= 0.000001 ? "full" : "half",
                    tx: tr.transaction.swaps[0].id,
                    remain: newBalance,
                });
                tokens[symbol_name] = tokens[symbol_name] ? tokens[symbol_name] + 1 : 1;
                if (newBalance <= 0.000001) {
                    delete positions[symbol_name]
                } else {
                    positions[symbol_name].balance = newBalance;
                    positions[symbol_name].avg = open_price;
                }
            }
        }
    }

    const totalTrades = trades.length;
    //winCounter + lossCounter;
    if (totalTrades == 0) {
        winRate = 0;
    } else {
        winRate = (winCounter / totalTrades) * 100;
    }

    let remainProfit = 0;
    let remainRoi = 0;
    let position;
    const symbols = Object.keys(positions);
    for (let si = 0; si < symbols.length; si++) {
        const symbol = symbols[si];
        position = positions[symbol];
        const price_eth = await get_token_eth_price(position.token, version);
        if (price_eth) {
            remainProfit = position.balance > 0 ? (price_eth - position.avg) * position.balance : 0;
            remainRoi = initEth == 0 ? 0 : remainProfit / initEth;
        }
    }

    totalProfit_roi = totalProfit_roi + remainRoi;
    totalProfit = totalProfit + remainProfit;
    let besttrade;
    let worsttrade;
    let mostf;
    let average_holding = 0;
    for (let i = 0; i < trades.length; i++) {
        if (trades[i].profit_roi > 0) {
            if (!besttrade || besttrade.profit_roi < trades[i].profit_roi) {
                besttrade = trades[i];
            }
        }
        if (trades[i].profit_roi < 0) {
            if (!worsttrade || worsttrade.profit_roi > trades[i].profit_roi) {
                worsttrade = trades[i];
            }
        }
        average_holding += (trades[i].close_time - trades[i].open_time)

    }
    if (average_holding > 0) average_holding = average_holding / trades.length;
    for (let i = 0; i < Object.keys(tokens).length; i++) {
        const t = tokens[Object.keys(tokens)[i]];
        if (!mostf || mostf.count < t) {
            mostf = {
                symbol: Object.keys(tokens)[i],
                count: t
            }
        }
    }

    return {
        initEth,
        positions,
        trades,
        totalProfit,
        totalProfit_roi,
        winRate,
        totalTrades,
        totalBuy,
        remainProfit,
        remainRoi,
        besttrade,
        worsttrade,
        mostf,
        average_holding
    };
}

export {
    getSwapV2,
    getSwapV3,
    get_portfolio,
    getTrading
}