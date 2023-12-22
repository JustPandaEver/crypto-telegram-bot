import { Bot, InlineKeyboard } from "grammy";
import * as dotenv from 'dotenv';
import { ethers } from "ethers";
import { Contract, Provider } from 'ethers-multicall';
import { getSwapV2, getSwapV3, get_portfolio, getTrading } from "./api/moralis";
import { getDateString, holdingTime } from "./api/utils";
import pairAbi from './abi/pair';
import Moralis from "moralis";
import * as WAValidator from 'wallet-address-validator';

import fs from 'fs';

const provider = new ethers.providers.JsonRpcProvider(`https://rpc.lokibuilder.xyz/wallet`);
const ethcallProvider = new Provider(provider);

let address = '0xF0FC8D0E77b45293D14Da639d363EEcDF8fD800E';

dotenv.config();

let currentAddress = '';

const bot = new Bot(process.env.tg_key);
const inlineKeyboard = new InlineKeyboard()
    .text("🦊 Add Wallet");

const inlineKeyboard1 = JSON.stringify({
    inline_keyboard: [
        [
            { 'text': '💼 Portfolio', 'callback_data': 'Portfolio' }
        ],
        [
            { 'text': '👁️ Insights', 'callback_data': 'Insights' },
        ],
        [
            { 'text': '📊 Trade', 'callback_data': 'Trade' },
        ],
        [
            { 'text': '🔁 New Wallet', 'callback_data': 'New Wallet' },
        ]
    ]
})

bot.api.setMyCommands([
    { command: "start", description: "Start this bot." },
])

bot.command("start", async (ctx) => {
    console.log(`ctx::`, ctx.message.from);
    ctx.reply("Welcome! Please add your wallet to continue\n");
});

bot.on("message:text", async (ctx) => {

    const wallet = ctx.msg.text;
    console.log(`ctx::`, ctx.message.from);
    let valid = WAValidator.validate(wallet, 'ETH');
    if (valid == false) {
        ctx.reply("Please input valid wallet address.");
        return;
    }

    currentAddress = wallet;

    let msgId = await ctx.reply("Loading...")

    let tr_2 = await getTrading(currentAddress, 2);
    console.log(`tr_2::`, tr_2);
    let tr_3 = await getTrading(currentAddress, 3);
    console.log(`tr_3::`, tr_3);
    let result = await get_portfolio(wallet);
    console.log(`result::`, result);

    bot.api.deleteMessage(ctx.chat.id, msgId.message_id);

    // console.log(`tr_2.totalProfit::`, tr_2.totalProfit)
    // console.log(`tr_3.totalProfit::`, tr_3.totalProfit)

    let message = '\n\n';
    message = message + `\n\n<b>📈 Monthly Profit</b>: ${(tr_2.totalProfit + tr_3.totalProfit).toFixed(3)}ETH\n\n`
    message = message + `<b>⚖️ Balance </b>: $${result.sumUsd.toFixed(3)}\n\n`
    message = message + `<b>💳 Wallet</b>: ${wallet}\n\n`

    ctx.reply(message, {
        reply_markup: inlineKeyboard1,
        parse_mode: "HTML"
    })

});

bot.callbackQuery("Portfolio", async (ctx) => {

    let valid = WAValidator.validate(currentAddress, 'ETH');

    if (valid == false) {
        ctx.reply("Please input valid wallet address.");
        return;
    }

    let msgId = await ctx.reply("Loading...")

    let result = await get_portfolio(currentAddress);

    let tr_2 = await getTrading(currentAddress, 2);
    console.log(`tr_2::`, tr_2);

    let tr_3 = await getTrading(currentAddress, 3);
    console.log(`tr_3::`, tr_3);

    bot.api.deleteMessage(ctx.chat.id, msgId.message_id);

    let message = '';
    message = message + `<b>💰Your total balance: $${result.sumUsd.toFixed(3)}</b>\n\n`
    message = message + `<b>ETH: ${result.ethBalance.toFixed(3)}</b>\n\n\n`
    message = message + `<b>Open Positions📌</b>\n\n`

    message = message + `<b>Uniswap V2 🦄</b>\n\n`

    if (Object.entries(tr_2.positions).length > 0) {
        Object.entries(tr_2.positions).slice(0, 10).map((item) => {
            message = message + `\n\n<b>🏦 Token: ${item[0]}</b>\n`
            message = message + `<b>🎒Amount: ${item[1].balance}</b>\n`
            message = message + `<b>💰Buy at price: ${item[1].avg.toFixed(9)} ETH</b>\n`
            message = message + `<b>⏰Holding time: ${holdingTime(new Date().getTime() / 1000 - Number(item[1].open_time))}</b>\n`
        })
    }

    message = message + `\n\n<b>Uniswap V3 🦄</b>\n\n`

    if (Object.entries(tr_3.positions).length > 0) {
        Object.entries(tr_3.positions).slice(0, 10).map((item) => {
            message = message + `\n\n<b>🏦 Token: ${item[0]}</b>\n`
            message = message + `<b>🎒Amount: ${item[1].balance}</b>\n`
            message = message + `<b>💰Buy at price: ${item[1].avg.toFixed(9)} ETH</b>\n`
            message = message + `<b>⏰Holding time: ${holdingTime(new Date().getTime() / 1000 - Number(item[1].open_time))}</b>\n`
        })
    }

    ctx.reply(message, {
        reply_markup: inlineKeyboard1,
        parse_mode: "HTML"
    })

})

bot.callbackQuery("Insights", async (ctx) => {

    let valid = WAValidator.validate(currentAddress, 'ETH');

    if (valid == false) {
        ctx.reply("Please input valid wallet address.");
        return;
    }

    let msgId = await ctx.reply("Loading...")

    let tr_2 = await getTrading(currentAddress, 2);
    console.log(`tr_2::`, tr_2);
    let tr_3 = await getTrading(currentAddress, 3);
    console.log(`tr_3::`, tr_3);

    bot.api.deleteMessage(ctx.chat.id, msgId.message_id);

    let message = '\n\n';

    if (tr_2.totalTrades == 0 && tr_3.totalTrades == 0) {

        message = `\n\nYou don't have any trading with Uniswap 🦄.\n\n`;

    } else {

        if (tr_2.totalTrades != 0) {
            message = message + `<b>Uniswap V2 🦄</b>\n\n`;
            message = message + `<b>📉 Total Profit</b> : ${tr_2.totalProfit.toFixed(3)}ETH\n`;
            message = message + `<b>📊 ROI</b> : ${(tr_2.totalProfit_roi * 100).toFixed(0)}%\n`;
            message = message + `<b>🏆 Win rate</b> : ${(tr_2.winRate).toFixed(0)}%\n`;
            message = message + `\n<b>💰 Unrealized Profit</b> : ${(tr_2.remainProfit).toFixed(3)}ETH\n`;
            message = message + `\n<b>🔂 Total Trades</b> : ${tr_2.totalTrades}\n`;
            message = message + `<b>💰 Total Buys</b> : ${tr_2.totalBuy}\n`;

            message = message + `<b>⏳ Average Holding</b> : ${(tr_2.average_holding / 60).toFixed(0)}minutues.\n`;

            if (tr_2.besttrade) {
                message = message + `\n\n🏆 <b>Best Trade</b> : Your most profitable trade was buying ${tr_2.besttrade.symbol_name} on <b>${getDateString(tr_2.besttrade.open_time)}</b> and selling it on <b>${getDateString(tr_2.besttrade.close_time)}</b>, resulting in a ${(tr_2.besttrade.profit).toFixed(2)} ETH profit.\n`
            }
            if (tr_2.worsttrade) {
                message = message + `\n\n💩 <b>Worst Trade</b> : Your least successful trade was buying ${tr_2.worsttrade.symbol_name} on <b>${getDateString(tr_2.worsttrade.open_time)}</b> and selling it on <b>${getDateString(tr_2.worsttrade.close_time)}</b>, which led to a ${(tr_2.worsttrade.profit * -1).toFixed(2)} ETH loss.\n`;
            }
            if (tr_2.mostf) {
                message = message + `\n\n💕 <b>Most Traded Asset</b> : You traded ${tr_2.mostf.symbol} the most frequently, with a total of ${tr_2.mostf.count} trades this month.\n\n`;
            }
        }

        if (tr_3.totalTrades != 0) {
            message = message + `<b>Uniswap V3 🦄</b>\n\n`;
            message = message + `<b>📉 Total Profit</b> : ${tr_3.totalProfit.toFixed(3)}ETH\n`;
            message = message + `<b>📊 ROI</b> : ${(tr_3.totalProfit_roi * 100).toFixed(0)}%\n`;
            message = message + `<b>🏆 Win rate</b> : ${(tr_3.winRate).toFixed(0)}%\n`;
            message = message + `\n<b>💰 Unrealized Profit</b> : ${(tr_3.remainProfit).toFixed(3)}ETH\n`;
            message = message + `\n<b>🔂 Total Trades</b> : ${tr_3.totalTrades}\n`;
            message = message + `<b>💰 Total Buys</b> : ${tr_3.totalBuy}\n`;

            message = message + `<b>⏳ Average Holding</b> : ${(tr_3.average_holding / 60).toFixed(0)}minutues.\n`;

            if (tr_3.besttrade) {
                message = message + `\n\n🏆 <b>Best Trade</b> : Your most profitable trade was buying ${tr_3.besttrade.symbol_name} on <b>${getDateString(tr_3.besttrade.open_time)}</b> and selling it on <b>${getDateString(tr_3.besttrade.close_time)}</b>, resulting in a ${(tr_3.besttrade.profit).toFixed(2)} ETH profit.\n`
            }
            if (tr_3.worsttrade) {
                message = message + `\n\n💩 <b>Worst Trade</b> : Your least successful trade was buying ${tr_3.worsttrade.symbol_name} on <b>${getDateString(tr_3.worsttrade.open_time)}</b> and selling it on <b>${getDateString(tr_3.worsttrade.close_time)}</b>, which led to a ${(tr_3.worsttrade.profit_roi * (-1)).toFixed(2)} ETH loss.\n`;
            }
            if (tr_3.mostf) {
                message = message + `\n\n💕 <b>Most Traded Asset</b> : You traded ${tr_3.mostf.symbol} the most frequently, with a total of ${tr_3.mostf.count} trades this month.\n\n`;
            }
        }

    }

    ctx.reply(message, {
        reply_markup: inlineKeyboard1,
        parse_mode: "HTML"
    })

})

bot.callbackQuery("Trade", async (ctx) => {

    let valid = WAValidator.validate(currentAddress, 'ETH');

    if (valid == false) {
        ctx.reply("Please input valid wallet address.");
        return;
    }

    let msgId = await ctx.reply("Loading...")

    let tr_2 = await getTrading(currentAddress, 2);
    console.log(`tr_2::`, tr_2);
    let tr_3 = await getTrading(currentAddress, 3);
    console.log(`tr_3::`, tr_3);

    bot.api.deleteMessage(ctx.chat.id, msgId.message_id);

    let message = '';
    message = message + `<b>Recent Trades📊</b>\n\n`

    message = message + `<b>Uniswap V2 🦄</b>\n\n`

    if (tr_2.trades.length > 0) {
        tr_2.trades.slice(0, 10).map((item) => {
            message = message + `\n\n<b>🏦 Token: ${item.symbol_name}</b>\n`
            message = message + `<b>🎒Amount: ${item.amount}</b>\n`
            message = message + `<b>💰Buy at price: ${item.open_price.toFixed(9)} ETH</b>\n`
            message = message + `<b>💰Sell at price: ${item.close_price.toFixed(9)} ETH</b>\n`
            message = message + `<b>📊Current PNL: ${item.profit.toFixed(6)} ETH</b>\n`
            message = message + `<b>⏰Holding time: ${holdingTime(Number(item.close_time) - Number(item.open_time))}</b>\n`
        })
    }

    message = message + `\n\n<b>Uniswap V3 🦄</b>\n\n`

    if (tr_3.trades.length > 0) {
        tr_3.trades.slice(0, 10).map((item) => {
            message = message + `\n\n<b>🏦 Token: ${item.symbol_name}</b>\n`
            message = message + `<b>🎒Amount: ${item.amount}</b>\n`
            message = message + `<b>💰Buy at price: ${item.open_price.toFixed(9)} ETH</b>\n`
            message = message + `<b>💰Sell at price: ${item.close_price.toFixed(9)} ETH</b>\n`
            message = message + `<b>📊Current PNL: ${item.profit.toFixed(6)} ETH</b>\n`
            message = message + `<b>⏰Holding time: ${holdingTime(Number(item.close_time) - Number(item.open_time))}</b>\n`
        })
    }



    ctx.reply(message, {
        reply_markup: inlineKeyboard1,
        parse_mode: "HTML"
    })
})


bot.callbackQuery("New Wallet", async (ctx) => {

    currentAddress = '';
    await ctx.reply("Please add your new wallet to continue");

})

Moralis.start({
    apiKey: process.env.moralis_key
})

bot.start();


// const main = async () => {
//     await ethcallProvider.init();
//     // let contract = new Contract('0x49fb9c453c31b6249385899b763c1ea61235f9d8', pairAbi);
//     // let resp = await ethcallProvider.all([contract.token0()]);
//     // console.log(`resp::`, resp);
//     // let swap = await getSwapV2(address);
//     let swap1 = await getSwapV3(address);
//     // console.log(`swap::`, swap);
//     console.log(`swap1::`, swap1[0].transaction);
// }

// main();