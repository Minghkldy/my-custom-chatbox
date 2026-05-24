const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 🔗 သင်၏ Render URL အစစ်အမှန်ကို ဤနေရာတွင် တိုက်ရိုက်သတ်မှတ်ပေးလိုက်ပါသည်
const RENDER_BACKEND_URL = "https://my-custom-chatbox.onrender.com"; 

let configStorage = {
    tgToken: '',
    fbToken: '',
    fbVerify: ''
};
let messageLogs = [];
let userList = [];

app.get('/', (req, res) => {
    res.send('🚀 Chatbox Backend Server အလုပ်လုပ်နေပါပြီ!');
});

// Dashboard မှ Token များ လှမ်းသိမ်းသည့်နေရာ
app.post('/api/save-config', async (req, res) => {
    const { tgToken, fbToken, fbVerify } = req.body;
    configStorage.tgToken = tgToken;
    configStorage.fbToken = fbToken;
    configStorage.fbVerify = fbVerify;
    console.log('✅ Token များကို Server တွင် သိမ်းဆည်းပြီးပါပြီ');

    // Webhook ကို Render URL အစစ်ဖြင့် အတင်းအကျပ် သတ်မှတ်ခြင်း
    if (tgToken) {
        try {
            const webhookUrl = `${RENDER_BACKEND_URL}/webhook/telegram`;
            console.log(`📡 Telegram သို့ Webhook Link ပို့နေသည်: ${webhookUrl}`);
            
            const tgRes = await axios.get(`https://api.telegram.org/bot${tgToken}/setWebhook?url=${webhookUrl}`);
            console.log('🟢 Telegram Response:', tgRes.data);
        } catch (error) {
            console.error('❌ Telegram Webhook ချိတ်ဆက်မှု မအောင်မြင်ပါ:', error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

app.get('/api/messages', (req, res) => {
    res.json({ users: userList, logs: messageLogs });
});

// Admin ဘက်က တစ်ဦးချင်းစီကို စာ သို့မဟုတ် ပုံ ပို့သည့်နေရာ
app.post('/api/send-message', async (req, res) => {
    const { text, userId, platform } = req.body;
    messageLogs.push({ userId, text, sender: 'admin', timestamp: new Date() });

    // Admin ဘက်က စာပြန်လိုက်လျှင် ၎င်း User ၏ Unread ကို ၀ ပြန်လုပ်ပေးပြီး စာရင်းထိပ်ဆုံးသို့ ပို့ပေးခြင်း
    const user = userList.find(u => u.id == userId);
    if (user) {
        user.unread = 0;
        // ပုံလင့်ခ်ဖြစ်နေရင် အစမ်းကြည့်စာသားကို 📷 Photo လို့ ပြောင်းပြပါမည်
        user.lastMsg = text.startsWith('http') && (text.match(/\.(jpeg|jpg|gif|png)$/) || text.includes('file/bot')) ? '📷 Photo' : text;
        user.time = 'Just Now';
        userList = [user, ...userList.filter(u => u.id != userId)];
    }

    if (platform === 'Telegram' && configStorage.tgToken) {
        try {
            // လင့်ခ်က ပုံလင့်ခ်ဖြစ်နေရင် sendPhoto API ကို သုံးပြီး ပုံအဖြစ် ထွက်သွားအောင် လုပ်ခြင်း
            const isPhoto = text.startsWith('http') && (text.match(/\.(jpeg|jpg|gif|png)$/) || text.includes('file/bot'));
            
            if (isPhoto) {
                await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendPhoto`, {
                    chat_id: userId,
                    photo: text
                });
            } else {
                await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendMessage`, {
                    chat_id: userId,
                    text: text
                });
            }
        } catch (err) {
            console.error('❌ Telegram သို့ စာပို့မရပါ:', err.message);
        }
    }
    res.sendStatus(200);
});

// 📢 Broadcast Message (လူအကုန်လုံးကို တစ်ပြိုင်နက်စာပို့ရန် API လမ်းကြောင်းအသစ်)
app.post('/api/broadcast', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).send('Message text is required');

    console.log(`📢 Broadcast စတင်နေပြီ... လူဦးရေစုစုပေါင်း: ${userList.length} ယောက်`);

    // လူတိုင်းဆီ Loop ပတ်ပြီး တစ်ယောက်ချင်းစီ လိုက်ပို့ပေးခြင်း
    for (const user of userList) {
        messageLogs.push({ userId: user.id, text: text, sender: 'admin', timestamp: new Date() });
        user.lastMsg = text.startsWith('http') && (text.match(/\.(jpeg|jpg|gif|png)$/) || text.includes('file/bot')) ? '📷 Photo' : text;
        user.time = 'Just Now';

        if (user.platform === 'Telegram' && configStorage.tgToken) {
            try {
                const isPhoto = text.startsWith('http') && (text.match(/\.(jpeg|jpg|gif|png)$/) || text.includes('file/bot'));
                if (isPhoto) {
                    await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendPhoto`, { chat_id: user.id, photo: text });
                } else {
                    await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendMessage`, { chat_id: user.id, text: text });
                }
            } catch (err) {
                console.error(`❌ Broadcast ပို့မရပါ (User: ${user.id}):`, err.message);
            }
        }
    }
    res.status(200).send({ success: true, message: 'Broadcast sent successfully!' });
});

// index.html မှ စာဖတ်လိုက်သည့်အခါ Noti ဖျောက်ပေးရန် API
app.post('/api/mark-read', (req, res) => {
    const { userId } = req.body;
    const user = userList.find(u => u.id == userId);
    if (user) {
        user.unread = 0;
    }
    res.sendStatus(200);
});

app.post('/webhook/telegram', async (req, res) => {
    console.log('📥 Telegram Webhook သို့ စာဝင်လာသည်:', JSON.stringify(req.body));
    
    const message = req.body.message;
    if (message) {
        const chatId = message.chat.id;
        const firstName = message.chat.first_name || 'Unknown User';
        let text = message.text || '';

        // 📷 တစ်ဖက်လူက ပုံပို့လာလျှင် ပုံရဲ့ တိုက်ရိုက် URL လင့်ခ်ကို Telegram Server ဆီက လှမ်းတောင်းခြင်း
        if (message.photo && message.photo.length > 0) {
            try {
                const fileId = message.photo[message.photo.length - 1].file_id; // အကြည်ဆုံးပုံကို ယူခြင်း
                const fileRes = await axios.get(`https://api.telegram.org/bot${configStorage.tgToken}/getFile?file_id=${fileId}`);
                const filePath = fileRes.data.result.file_path;
                text = `https://api.telegram.org/file/bot${configStorage.tgToken}/${filePath}`; // ပုံ၏ တိုက်ရိုက်လင့်ခ်
            } catch (pErr) {
                text = '📷 Send you a photo';
            }
        }
        
        messageLogs.push({ userId: chatId, text, sender: 'user', timestamp: new Date() });

        const userIdx = userList.findIndex(u => u.id == chatId);
        const displayMsg = text.startsWith('http') ? '📷 Photo' : text;

        if (userIdx !== -1) {
            // ရှိပြီးသားလူဆိုလျှင် Noti တိုးပြီး List ရဲ့ ထိပ်ဆုံး (Index 0) သို့ ရွှေ့မည်
            const updatedUser = userList[userIdx];
            updatedUser.lastMsg = displayMsg;
            updatedUser.time = 'Just Now';
            updatedUser.unread = (updatedUser.unread || 0) + 1;
            
            userList.splice(userIdx, 1);
            userList.unshift(updatedUser);
        } else {
            // လူသစ်ဆိုလျှင် အပေါ်ဆုံးကနေ တန်းထည့်မည်
            userList.unshift({ 
                id: chatId, 
                name: firstName, 
                platform: 'Telegram', 
                lastMsg: displayMsg, 
                gender: 'Not Specified', 
                time: 'Just Now',
                unread: 1 
            });
        }
    }
    res.sendStatus(200);
});

app.get('/webhook/messenger', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === configStorage.fbVerify) {
            console.log('✅ Facebook Webhook အတည်ပြုချက် အောင်မြင်သည်!');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post('/webhook/messenger', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            if (webhookEvent && webhookEvent.message) {
                const senderId = webhookEvent.sender.id;
                let text = webhookEvent.message.text || '';
                
                // 📷 Messenger မှ ပုံဝင်လာလျှင် ပုံရဲ့ Attachment လင့်ခ်ကို ယူခြင်း
                if (webhookEvent.message.attachments && webhookEvent.message.attachments[0].type === 'image') {
                    text = webhookEvent.message.attachments[0].payload.url;
                }
                
                messageLogs.push({ userId: senderId, text, sender: 'user', timestamp: new Date() });

                const userIdx = userList.findIndex(u => u.id == senderId);
                const displayMsg = text.startsWith('http') ? '📷 Photo' : text;

                if (userIdx !== -1) {
                    // ရှိပြီးသားလူဆိုလျှင် Noti တိုးပြီး ထိပ်ဆုံးသို့ ပို့မည်
                    const updatedUser = userList[userIdx];
                    updatedUser.lastMsg = displayMsg;
                    updatedUser.time = 'Just Now';
                    updatedUser.unread = (updatedUser.unread || 0) + 1;
                    
                    userList.splice(userIdx, 1);
                    userList.unshift(updatedUser);
                } else {
                    // လူသစ်ဆိုလျှင် ထိပ်ဆုံးက ထည့်မည်
                    userList.unshift({ 
                        id: senderId, 
                        name: `FB User ${senderId.substring(0,5)}`, 
                        platform: 'Messenger', 
                        lastMsg: displayMsg, 
                        gender: 'Not Specified', 
                        time: 'Just Now',
                        unread: 1 
                    });
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🎯 Server is running on port ${PORT}`);
});
