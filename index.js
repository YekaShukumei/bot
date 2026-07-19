const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

if (!config.botToken || config.botToken.length < 10) {
    console.log('ERROR: Bot token tidak valid! Cek config.json ANJING');
    process.exit(1);
}
const bot = new Telegraf(config.botToken);
bot.use(session());

const ADMIN_FILE = './admin.json';
let adminList = [];

try {
    if (fs.existsSync(ADMIN_FILE)) {
        adminList = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
    } else {
        adminList = [
            {
                id: String(config.ownerId || '1017425698'),
                username: 'owner',
                role: 'owner',
                added_by: 'system',
                added_at: new Date().toISOString()
            }
        ];
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminList, null, 2));
        console.log('admin.json created with owner:', config.ownerId);
    }
} catch (e) {
    console.log('[!] Error loading admin.json:', e.message);
}

function saveAdmins() {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminList, null, 2));
}

const LOGS_FILE = './logs.json';
const MEMBERS_FILE = './members.json';

let logs = [];
let members = [];

try {
    if (fs.existsSync(LOGS_FILE)) {
        logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
} catch (e) {}

try {
    if (fs.existsSync(MEMBERS_FILE)) {
        members = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));
    }
} catch (e) {}

function saveLogs() {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

function saveMembers() {
    fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2));
}

async function isAdmin(ctx) {
    try {
        const userId = String(ctx.from.id);
        return adminList.some(admin => String(admin.id) === userId);
    } catch (e) {
        return false;
    }
}

async function isOwner(ctx) {
    try {
        const userId = String(ctx.from.id);
        const admin = adminList.find(a => String(a.id) === userId);
        return admin && admin.role === 'owner';
    } catch (e) {
        return false;
    }
}

const EMOJI_MAP = {
    '❤️': '5787256448954142561',
    '🔥': '5197608927281307290',
    '💎': '5891044423856296980',
    '👾': '5370869711888194012',
    '🏆': '5278607217300356918',
    '🌐': '5926925735993283107',
    '💫': '6289506750567552671',
    '🎁': '5802910664150226061',
    '💰': '5224257782013769471',
    '📣': '6294077502008595580',
    '📜': '5197276290654164365',
    '✔️': '6325404984875686132',
    '⚠️': '5787656288934564517',
    '💬': '6253354821131176597',
    '🍀': '5812148421544382372',
    '🤩': '6294047321273407224',
    '🤖': '6293849954641253478',
    '📌': '5801018335919347111',
    '🚀': '5197591528368787961'
};

function replaceEmoji(text) {
    let result = text;
    for (const [emoji, id] of Object.entries(EMOJI_MAP)) {
        result = result.replaceAll(emoji, `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`);
    }
    return result;
}

async function sendPremiumPhoto(ctx, photoUrl, text, extra = {}) {
    try {
        const premiumText = replaceEmoji(text);
        return await ctx.replyWithPhoto(photoUrl, {
            caption: premiumText,
            parse_mode: 'HTML',
            ...extra
        });
    } catch (error) {
        return await ctx.reply(text, { parse_mode: 'HTML', ...extra });
    }
}

async function sendPremiumText(ctx, text, extra = {}) {
    try {
        const premiumText = replaceEmoji(text);
        return await ctx.reply(premiumText, { parse_mode: 'HTML', ...extra });
    } catch (error) {
        return await ctx.reply(text, { ...extra });
    }
}

async function logChat(ctx) {
    try {
        const msg = ctx.message;
        if (!msg || !msg.text) return;
        
        const log = {
            id: msg.message_id,
            user_id: msg.from.id,
            username: msg.from.username || msg.from.first_name,
            first_name: msg.from.first_name,
            text: msg.text,
            chat_id: msg.chat.id,
            chat_type: msg.chat.type,
            timestamp: new Date().toISOString()
        };
        
        logs.push(log);
        if (logs.length > 2000) logs.shift();
        saveLogs();
    } catch (e) {}
}

async function logMember(ctx) {
    try {
        const msg = ctx.message;
        if (!msg || !msg.from) return;
        
        const existing = members.find(m => String(m.user_id) === String(msg.from.id));
        if (!existing) {
            members.push({
                user_id: msg.from.id,
                username: msg.from.username || msg.from.first_name,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name || '',
                is_bot: msg.from.is_bot || false,
                joined_at: new Date().toISOString()
            });
            saveMembers();
        }
    } catch (e) {}
}

async function syncMembers(ctx) {
    if (!await isAdmin(ctx)) {
        await ctx.reply('❌ Lu bukan admin, BANGSAT!');
        return;
    }

    const statusMsg = await ctx.reply('🔄 **Scanning members...**');
    
    try {
        let added = 0;
        let skipped = 0;
        let totalScanned = 0;
        
        const membersList = await ctx.telegram.getChatMembers(ctx.chat.id, { limit: 200 });
        
        for (const member of membersList) {
            const user = member.user;
            if (user.is_bot) continue;
            
            totalScanned++;
            
            const existing = members.find(m => String(m.user_id) === String(user.id));
            if (!existing) {
                members.push({
                    user_id: user.id,
                    username: user.username || user.first_name,
                    first_name: user.first_name,
                    last_name: user.last_name || '',
                    is_bot: user.is_bot || false,
                    joined_at: new Date().toISOString()
                });
                added++;
            } else {
                skipped++;
            }
        }
        
        saveMembers();
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            null,
            `SYNC SELESAI!\n\n` +
            `Total Member: ${members.length}\n` +
            `Added: ${added}\n` +
            `Skipped: ${skipped}\n` +
            `File: ${MEMBERS_FILE}`
        );
        
    } catch (error) {
        await ctx.reply(`❌ Error: ${error.message}\n\n💡 Pastikan bot jadi ADMIN di grup!`);
        console.log('[!] Sync error:', error.message);
    }
}

async function broadcastMessage(ctx, message) {
    if (!await isAdmin(ctx)) {
        await ctx.reply('❌ Anda bukan admin!');
        return;
    }

    if (members.length === 0) {
        await ctx.reply('❌ Tidak ada member yang terdaftar!');
        return;
    }

    const totalMembers = members.length;
    
    const statusMsg = await ctx.reply(
        `📢 BROADCAST DIMULAI!\n\n` +
        `Target: ${totalMembers} member\n` +
        `Pesan: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}\n\n` +
        `⏳ Mengirim... 0/${totalMembers}`
    );

    let sent = 0;
    let failed = 0;
    let failedList = [];

    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        try {
            await ctx.telegram.sendMessage(member.user_id, message, { 
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            sent++;
        } catch (e) {
            failed++;
            failedList.push(member.username || member.user_id);
        }

        if (i % 5 === 0 || i === members.length - 1) {
            try {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    statusMsg.message_id,
                    null,
                    `BROADCAST PROGRESS SABAR\n\n` +
                    `✅ Berhasil: ${sent}\n` +
                    `❌ Gagal: ${failed}\n` +
                    `📊 Progress: ${i+1}/${totalMembers}`
                );
            } catch (e) {}
        }

        await new Promise(resolve => setTimeout(resolve, 150));
    }

    let resultText = 
`BROADCAST SELESAI BRO

━━━━━━━━━━━━━━━━
  STATISTIK:
• ✅ Berhasil: ${sent}
• ❌ Gagal: ${failed}
• 📊 Total: ${totalMembers}
• 📈 Success Rate: ${sent > 0 ? Math.round(sent/totalMembers*100) : 0}%

━━━━━━━━━━━━━━━━
📝 PESAN:
${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`;

    if (failedList.length > 0) {
        const uniqueFailed = [...new Set(failedList)];
        resultText += `\n\n❌ Gagal dikirim ke:\n`;
        resultText += uniqueFailed.slice(0, 10).join('\n');
        if (uniqueFailed.length > 10) {
            resultText += `\n... dan ${uniqueFailed.length - 10} lainnya`;
        }
    }

    await ctx.reply(resultText);
}

async function showAdminMenu(ctx) {
    if (!await isAdmin(ctx)) {
        await ctx.reply('❌ Anda tidak terdaftar sebagai admin!');
        return;
    }

    const isOwnerUser = await isOwner(ctx);
    const totalMembers = members.length;
    const totalLogs = logs.length;
    const totalAdmins = adminList.length;
    const chatId = ctx.chat.id;

    const adminText = 
`❤️‍🔥👑 WELCOME TO ADMIN! ❤️‍🔥👑

📊 STATISTIK:
• 👥 Total Member: ${totalMembers}
• 📝 Total Logs: ${totalLogs}
• 👑 Total Admin: ${totalAdmins}
• 🆔 Chat ID: ${chatId}
• 👤 Role: ${isOwnerUser ? 'OWNER' : 'ADMIN'}

━━━━━━━━━━━━━━━━

📢 Broadcast - Kirim pesan ke semua member
📊 Logs - Lihat history chat + ID
👥 Members - Lihat daftar member + ID
📈 Statistik - Info lengkap bot
🔄 Sync Member - Scan ulang semua member grup

${isOwnerUser ? '👑 Manage Admin - Tambah/hapus admin' : ''}

Pilih menu di bawah:`;

    let adminKeyboard = [
        [Markup.button.callback('Broadcast', 'admin_broadcast')],
        [Markup.button.callback('Logs Chat', 'admin_logs')],
        [Markup.button.callback('List Member', 'admin_members')],
        [Markup.button.callback('Statistik', 'admin_stats')],
        [Markup.button.callback('Sync Member', 'admin_sync')]
    ];

    if (isOwnerUser) {
        adminKeyboard.push([Markup.button.callback('Manage Admin', 'admin_manage')]);
    }

    adminKeyboard.push([Markup.button.callback('Close Panel', 'admin_close')]);

    await sendPremiumText(ctx, adminText, {
        reply_markup: Markup.inlineKeyboard(adminKeyboard).reply_markup
    });
}

async function showLogs(ctx) {
    if (!await isAdmin(ctx)) return;

    if (logs.length === 0) {
        await sendPremiumText(ctx, 'Logs Chat\n\nBelum ada logs.');
        return;
    }

    let logText = '📊 LOGS CHAT\n\n';
    const recentLogs = logs.slice(-30).reverse();

    for (const log of recentLogs) {
        const user = log.username || log.first_name || 'Unknown';
        const userId = log.user_id;
        const text = log.text.length > 40 ? log.text.slice(0, 40) + '...' : log.text;
        const time = new Date(log.timestamp).toLocaleString('id-ID');
        logText += `🕐 ${time}\n👤 @${user} (ID: ${userId})\n💬 ${text}\n━━━━━━━━━━━━━━━━\n`;
    }

    logText += `\n📊 Total logs: ${logs.length}`;

    await sendPremiumText(ctx, logText);
}

async function showMembers(ctx) {
    if (!await isAdmin(ctx)) return;

    if (members.length === 0) {
        await sendPremiumText(ctx, 'Member List\n\nBelum ada member.');
        return;
    }

    let memberText = '👥 MEMBER LIST\n\n';
    const sortedMembers = members.slice().reverse();

    for (const member of sortedMembers) {
        const name = member.username || member.first_name || 'Unknown';
        const userId = member.user_id;
        const joined = new Date(member.joined_at).toLocaleDateString('id-ID');
        const isBot = member.is_bot ? '🤖' : '👤';
        memberText += `${isBot} @${name} (ID: ${userId}) - joined: ${joined}\n`;
    }

    memberText += `\n📊 Total members: ${members.length}`;

    await sendPremiumText(ctx, memberText);
}

async function showStats(ctx) {
    if (!await isAdmin(ctx)) return;

    const totalMembers = members.length;
    const totalLogs = logs.length;
    const totalAdmins = adminList.length;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeMembers = logs.filter(l => new Date(l.timestamp) > oneDayAgo);
    const uniqueActive = new Set(activeMembers.map(l => l.user_id)).size;

    const owners = adminList.filter(a => a.role === 'owner').length;
    const admins = adminList.filter(a => a.role === 'admin').length;

    const statsText = 
`📈 STATISTIK BOT

━━━━━━━━━━━━━━━━
👥 MEMBER
• Total Member: ${totalMembers}
• Aktif 24 Jam: ${uniqueActive}
• Total Chat: ${totalLogs}

━━━━━━━━━━━━━━━━
👑 ADMIN
• Total Admin: ${totalAdmins}
• 👑 Owner: ${owners}
• 🛡️ Admin: ${admins}

🕐 Last update: ${new Date().toLocaleString('id-ID')}`;

    await sendPremiumText(ctx, statsText);
}

async function showManageAdmin(ctx) {
    if (!await isOwner(ctx)) {
        await ctx.reply('❌ Hanya OWNER yang bisa mengelola admin!');
        return;
    }

    let adminText = 'MANAGE ADMIN\n\nDaftar Admin:\n';

    for (const admin of adminList) {
        const role = admin.role || 'admin';
        const roleIcon = role === 'owner' ? '👑' : '🛡️';
        const user = admin.username || admin.id;
        const added = new Date(admin.added_at).toLocaleDateString('id-ID');
        adminText += `${roleIcon} @${user} (${role}) - added: ${added}\n`;
    }

    adminText += `\n📊 Total: ${adminList.length} admin\n━━━━━━━━━━━━━━━━\n`;
    adminText += `Command:\n`;
    adminText += `/addadmin <user_id> - Tambah admin\n`;
    adminText += `/deladmin <user_id> - Hapus admin\n`;
    adminText += `/listadmin - Lihat daftar admin\n`;
    adminText += `\nCara dapat user_id:\n`;
    adminText += `1. Klik profil user\n`;
    adminText += `2. Copy ID dari logs\n`;
    adminText += `3. Atau kirim /id`;

    await sendPremiumText(ctx, adminText);
}

bot.action('admin_panel', async (ctx) => {
    await ctx.answerCbQuery();
    await showAdminMenu(ctx);
});

bot.action('admin_broadcast', async (ctx) => {
    await ctx.answerCbQuery();
    if (!await isAdmin(ctx)) return;
    
    if (members.length === 0) {
        await ctx.reply('❌ Belum ada member yang terdaftar!');
        return;
    }
    
    ctx.session = { action: 'broadcast' };
    
    await ctx.reply(
        `📢 KIRIM PESAN BROADCAST\n\n` +
        `Kirim pesan yang mau disebar ke semua member.\n` +
        `📊 Total member: ${members.length}\n\n` +
        `Ketik /cancel untuk batal.`
    );
});

bot.action('admin_logs', async (ctx) => {
    await ctx.answerCbQuery();
    await showLogs(ctx);
});

bot.action('admin_members', async (ctx) => {
    await ctx.answerCbQuery();
    await showMembers(ctx);
});

bot.action('admin_stats', async (ctx) => {
    await ctx.answerCbQuery();
    await showStats(ctx);
});

bot.action('admin_sync', async (ctx) => {
    await ctx.answerCbQuery();
    await syncMembers(ctx);
});

bot.action('admin_manage', async (ctx) => {
    await ctx.answerCbQuery();
    await showManageAdmin(ctx);
});

bot.action('admin_close', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
});

bot.command('start', async (ctx) => {
    try {
        console.log('[✅] /start from:', ctx.from.id, ctx.from.username);

        const startText = `❤️🔥 SELAMAT DATANG DI WINORA! ❤️🔥

🚀 WINORA88 🚀
🏆 Platform Gaming & Taruhan Terpercaya
🌐 winorawin1.online 🌐

━━━━━━━━━━━━━━━━
💫 Nikmati Berbagai Keuntungan:
🎁 Bonus New Member hingga 150%
💰 Bonus Deposit Harian up to 100%
📣 Komisi Referral Seumur Hidup
🔄 Cashback Mingguan up to 5%

━━━━━━━━━━━━━━━━
🤖 Butuh Bantuan?
💬 Chat bot kami: @winora88security_bot

🍀 Selamat bermain & semoga beruntung! 🍀
🤩🚀 Kami senang kamu di sini! 🤩🚀`;

        const isAdminUser = await isAdmin(ctx);

        let keyboard = [
            [Markup.button.url('🌐 Kunjungi Website', `https://${config.winoraLink}`)],
            [Markup.button.url('💬 Hubungi Admin', `https://t.me/wr88cs01`)]
        ];

        if (isAdminUser) {
            keyboard.push([Markup.button.callback('ADMIN ni boss', 'admin_panel')]);
        }

        await sendPremiumPhoto(ctx, 'https://files.catbox.moe/cns9ip.jpg', startText, {
            reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
        });

    } catch (error) {
        console.log('[!] Start error:', error.message);
        await ctx.reply('❌ Error: ' + error.message);
    }
});

bot.command('admin', async (ctx) => {
    await showAdminMenu(ctx);
});

bot.command('panel', async (ctx) => {
    await showAdminMenu(ctx);
});

bot.command('sync', async (ctx) => {
    await syncMembers(ctx);
});

bot.command('id', async (ctx) => {
    await ctx.reply(`🆔 Your ID: ${ctx.from.id}\n👤Username: @${ctx.from.username || 'N/A'}\n📛 **Name:** ${ctx.from.first_name}`);
});

bot.command('addadmin', async (ctx) => {
    if (!await isOwner(ctx)) {
        await ctx.reply('❌ Hanya OWNER yang bisa menambah admin!');
        return;
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        await ctx.reply('❌ Usage: /addadmin <user_id>\n\nContoh: /addadmin 1234567890');
        return;
    }

    const userId = String(args[1]);
    const existing = adminList.find(a => String(a.id) === userId);
    if (existing) {
        await ctx.reply(`User ${userId} sudah terdaftar sebagai admin!`);
        return;
    }

    let username = 'unknown';
    try {
        const user = await ctx.telegram.getChat(userId);
        username = user.username || user.first_name || 'unknown';
    } catch (e) {}

    adminList.push({
        id: userId,
        username: username,
        role: 'admin',
        added_by: String(ctx.from.id),
        added_at: new Date().toISOString()
    });
    saveAdmins();

    await ctx.reply(`Admin berhasil ditambahkan!\n\n ID: ${userId}\n👤 Username: @${username}\n👑 Role: admin`);
});

bot.command('deladmin', async (ctx) => {
    if (!await isOwner(ctx)) {
        await ctx.reply('❌ Hanya OWNER yang bisa menghapus admin!');
        return;
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        await ctx.reply('❌ Usage: /deladmin <user_id>\n\nContoh: /deladmin 1234567890');
        return;
    }

    const userId = String(args[1]);
    const index = adminList.findIndex(a => String(a.id) === userId);
    if (index === -1) {
        await ctx.reply(`❌ User ${userId} tidak terdaftar sebagai admin!`);
        return;
    }

    if (adminList[index].role === 'owner') {
        await ctx.reply('❌ Tidak bisa menghapus OWNER!');
        return;
    }

    const removed = adminList[index];
    adminList.splice(index, 1);
    saveAdmins();

    await ctx.reply(`✅ Admin berhasil dihapus!\n\n ID: ${removed.id}\n👤 Username: @${removed.username}`);
});

bot.command('listadmin', async (ctx) => {
    if (!await isAdmin(ctx)) return;

    let text = `DAFTAR ADMIN\n\n`;
    for (const admin of adminList) {
        const role = admin.role || 'admin';
        const roleIcon = role === 'owner' ? '👑' : '🛡️';
        const user = admin.username || admin.id;
        const added = new Date(admin.added_at).toLocaleDateString('id-ID');
        text += `${roleIcon} @${user} (${role}) - added: ${added}\n`;
    }
    text += `\n📊 Total: ${adminList.length} admin`;

    await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('cancel', async (ctx) => {
    ctx.session = {};
    await ctx.reply('❌ Action dibatalkan.');
});

bot.on('text', async (ctx) => {
    await logChat(ctx);
    await logMember(ctx);

    if (ctx.session && ctx.session.action === 'broadcast') {
        const msg = ctx.message.text;
        
        if (msg.toLowerCase() === '/cancel') {
            ctx.session = {};
            await ctx.reply('❌ Broadcast dibatalkan.');
            return;
        }

        await broadcastMessage(ctx, msg);
        ctx.session = {};
        return;
    }
});

bot.on('new_chat_members', async (ctx) => {
    try {
        const newMember = ctx.message.new_chat_members[0];
        if (!newMember) return;

        if (newMember.id === ctx.botInfo.id) {
            console.log('Bot added to group!');
            await ctx.reply('bot berhasil masuk digrub');
            return;
        }

        await logMember(ctx);

        const userId = newMember.id;
        const firstName = newMember.first_name || 'User';
        const escapeHTML = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeName = escapeHTML(firstName);

        const welcomeText = `
❤️🔥 WELCOME TO WINORA! ❤️🔥

💎 Hai <a href="tg://user?id=${userId}">${safeName}</a>, kamu sekarang resmi menjadi bagian
dari keluarga besar WINORA88 Official! 💎

━━━━━━━━━━━━━━━━
🔥👾 WINORA88 👾🔥
Trusted Gaming & Betting Platform
📌 Link: winorawin1.online

💫 Nikmati Berbagai Keuntungan:
🎁 Bonus New Member hingga 150%
💰 Bonus Deposit Harian 10%
📣 Komisi Referral Seumur Hidup
🔄 Cashback Mingguan 5%

━━━━━━━━━━━━━━━━
📜 Rule Grup:
✔️ Maintain good manners & respect each other
✔️ Just share the link winorawin1.online
⚠️ Spam, toxic & other promotions are prohibited

━━━━━━━━━━━━━━━━
🤖 Butuh Bantuan?
💬 Chat bot kami: @winora88security_bot

🍀 Selamat bermain & semoga beruntung! 🍀
🤩🚀 Kami senang kamu di sini! 🤩🚀`;

        await sendPremiumPhoto(ctx, 'https://files.catbox.moe/cns9ip.jpg', welcomeText);

    } catch (error) {
        console.log('[!] Welcome error:', error.message);
    }
});

bot.launch({
    allowedUpdates: ['message', 'callback_query', 'new_chat_members']
}).then(() => {
    const line = '═══════════════════════════════════════════════';
    console.log(`\n${line}`);
    console.log('WINORA BOT');
    console.log(line);
    console.log(`🕐 Waktu: ${new Date().toLocaleString('id-ID')}`);
    console.log(`${line}\n`);
}).catch((err) => {
    console.log('❌ Launch error:', err.message);
});

bot.catch((err, ctx) => {
    console.log(`[!] Error for ${ctx.updateType}:`, err.message);
});

process.once('SIGINT', () => {
    console.log('\n🛑 Bot stopped');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('\n🛑 Bot stopped');
    bot.stop('SIGTERM');
});
