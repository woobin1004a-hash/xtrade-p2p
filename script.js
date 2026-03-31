
        // Telegram WebApp object (prevents errors on browsers without Telegram)
        const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && typeof tg.expand === 'function') tg.expand();
        // 미니앱 준비 완료 신호(미호출 시 일부 API·링크 동작이 불안정할 수 있음)
        if (tg && typeof tg.ready === 'function') tg.ready();

        // iOS 텔레그램에서는 window.open 가로채기가 TonConnect 기본 흐름과 충돌할 수 있어, SDK 기본 동작을 유지합니다.
        // Supabase REST 연결 정보
        const SUPABASE_URL = 'https://fasigdxixqvgxurineyo.supabase.co';
        const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EdpKqwtWw9U3Z7_zsHuNHQ_uN9sET4M';
        // 봇 채팅방 기본 주소 (지갑 완료 후 텔레그램 복귀·Tonkeeper ret 공통)
        const TON_TWA_RETURN_URL = 'https://t.me/P2PxxBOT';
        // tg:// 딥링크 형식: 톤키퍼가 서명 완료 후 텔레그램으로 직접 복귀할 때 사용
        // https://t.me/ 형식은 브라우저를 거쳐 Telegram이 열리지만, tg:// 형식은 Telegram 앱을 바로 엶
        const TON_RETURN_TG_DEEPLINK = 'tg://resolve?domain=P2PxxBOT';

        /**
         * 거래 신청 저장 후 상대에게 텔레그램 알림(Supabase Edge Function `notify-new-order`).
         * 비워 두면 호출하지 않음 → 기존 동작과 동일. 설정은 TELEGRAM_NOTIFY_SETUP.md 참고.
         * Edge Secret ORDER_NOTIFY_SECRET 과 반드시 동일한 값.
         */
        // 데모 A에서는 서버 알림(Edge Function)을 사용하지 않으므로 비워 둡니다.
        const ORDER_NOTIFY_SECRET = '';

        /**
         * 미니앱에서 주문 후 상대에게 Telegram DM(sendMessage) 보낼 때 사용하는 BotFather HTTP API 토큰.
         * CORS/웹뷰 환경에 따라 실패할 수 있으나, 성공 시 즉시 DM이 갑니다.
         */
        const TELEGRAM_BOT_TOKEN_CLIENT = '8650490181:AAHfUu-_iAFbEgh3Cuq9C-F_gWrHfgd3NQs';

        function supabaseHeaders(extra) {
            var base = {
                'apikey': SUPABASE_PUBLISHABLE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
                'Content-Type': 'application/json'
            };
            if (extra && typeof extra === 'object') {
                Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
            }
            return base;
        }

        /**
         * 주문 저장 성공 후 비동기로 알림만 시도(실패해도 주문에는 영향 없음)
         */
        function notifyNewOrderTelegram(orderId) {
            var secret = String(ORDER_NOTIFY_SECRET || '').trim();
            if (!secret || !orderId) {
                return Promise.resolve();
            }
            var url = String(SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/notify-new-order';
            return fetch(url, {
                method: 'POST',
                headers: Object.assign({}, supabaseHeaders(), { 'x-order-notify-secret': secret }),
                body: JSON.stringify({ order_id: String(orderId) })
            }).then(function () {
                return null;
            }).catch(function () {
                return null;
            });
        }

        /**
         * DM 필수(데모용 A): 주문(거래 신청) 생성 성공 후 상대에게 즉시 DM 전송
         * @param {string} orderId 주문 ID
         * @param {string} orderSide buy|sell
         * @param {object} receiver Supabase receiver 객체
         * @param {number} usdt USDT 수량
         * @param {number} krw KRW 수량
         */
        function notifyNewOrderTelegramClient(orderId, orderSide, receiver, usdt, krw) {
            var token = String(TELEGRAM_BOT_TOKEN_CLIENT || '').trim();
            if (!orderId) return Promise.resolve();
            if (!token) {
                // 토큰이 비어있으면 DM이 아예 안 가므로 사용자에게 즉시 알려줌
                var msg = 'DM 전송 실패: TELEGRAM_BOT_TOKEN_CLIENT 값이 비어 있습니다.\nscript.js에서 BotFather HTTP API 토큰을 넣어주세요.';
                try {
                    if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                    else alert(msg);
                } catch (e) {}
                return Promise.resolve();
            }

            var side = String(orderSide || '').toLowerCase();
            var r = receiver && typeof receiver === 'object' ? receiver : {};

            // side == 'buy'  : 상대는 판매자(= 승인해야 하는 쪽) → receiver.sellerId 로 보냄
            // side == 'sell' : 상대는 구매자(= 승인해야 하는 쪽) → receiver.buyerId 로 보냄
            var chatId = '';
            var applicantName = '';
            var typeLine = '';

            if (side === 'buy') {
                chatId = String(r.sellerId || '').trim();
                applicantName = String(r.buyerName || '').trim() || '구매 신청자';
                typeLine = 'USDT 구매 신청이 도착했습니다.';
            } else {
                chatId = String(r.buyerId || '').trim();
                applicantName = String(r.sellerName || '').trim() || '판매 신청자';
                typeLine = 'USDT 판매 신청이 도착했습니다.';
            }

            if (!chatId) return Promise.resolve();

            var usdtN = Number(usdt || 0);
            var krwN = Number(krw || 0);
            // DM 각 줄 앞에 의미에 맞는 이모지(구매/판매는 제목 아이콘으로 구분)
            var headlineIcon = side === 'buy' ? '🛒' : '📤';
            // 실제 줄바꿈(\n) 사용 — 이전 \\n 은 문자 '\'+'n' 이라 텔레그램에 그대로 보였음
            var text =
                '📬 XTrade P2P\n\n' +
                headlineIcon + ' ' + String(typeLine || '') + '\n\n' +
                '👤 신청자: ' + String(applicantName || '') + '\n\n' +
                '💰 금액: ' + (Number.isFinite(usdtN) ? usdtN : 0) + ' USDT\n\n' +
                '💱 환산: ' + (Number.isFinite(krwN) ? krwN : 0) + ' KRW\n\n' +
                '🧾 주문 ID: ' + String(orderId || '') + '\n\n' +
                '✅ 미니앱에서 「내 주문」을 확인해 주세요.';

            var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
            // 1) JSON 우선 — 텔레그램은 HTTP 200이어도 body에 ok:false 를 줄 수 있음
            return fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    disable_web_page_preview: true
                })
            }).then(function (res) {
                if (!res || !res.ok) return Promise.reject(new Error('http'));
                return res.json().then(function (data) {
                    if (data && data.ok === true) return null;
                    return Promise.reject(new Error('telegram'));
                });
            }).catch(function () {
                // 2) iOS WebView CORS 우회: no-cors(응답 본문은 읽을 수 없음)
                try {
                    var formBody =
                        'chat_id=' + encodeURIComponent(chatId) +
                        '&text=' + encodeURIComponent(text) +
                        '&disable_web_page_preview=true';
                    return fetch(url, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formBody
                    }).catch(function () { return null; });
                } catch (e2) {
                    return null;
                }
            });
        }

        function toSupabaseListing(record) {
            return {
                id: String(record.id || ''),
                owner_id: String(record.ownerId || ''),
                owner_name: String(record.ownerName || 'User'),
                boost_usdt: Number(record.boostUsdt || 0),
                sell_mode: !!record.sellMode,
                buy_mode: !!record.buyMode,
                sell_margin_pct: Number(record.sellMarginPct || 0),
                buy_margin_pct: Number(record.buyMarginPct || 0),
                sell_price_krw: Number(record.sellPriceKrW || 0),
                buy_price_krw: Number(record.buyPriceKrW || 0),
                deposit_usdt: Number(record.depositUsdt || 0),
                order_min_usdt: Number(record.orderMinUsdt || 10),
                order_max_usdt: Number(record.orderMaxUsdt || 0),
                network: 'TON',
                bank_account_id: String(record.bankAccountId || ''),
                bank_text: String(record.bankText || ''),
                ton_wallet_address: String(record.tonWalletAddress || ''),
                ton_wallet_text: String(record.tonWalletText || ''),
                created_at: Number(record.createdAt || Date.now()),
                updated_at: Number(record.updatedAt || Date.now())
            };
        }

        /** Supabase/로컬 혼재 타입(boolean/string/number)을 안전하게 boolean으로 정규화 */
        function parseModeFlag(value) {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            if (typeof value === 'string') {
                var s = value.trim().toLowerCase();
                if (s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'y' || s === 'on') return true;
                if (s === 'false' || s === 'f' || s === '0' || s === 'no' || s === 'n' || s === 'off' || s === '') return false;
            }
            return !!value;
        }

        function fromSupabaseListing(row) {
            return {
                id: row.id,
                ownerId: row.owner_id,
                ownerName: row.owner_name,
                boostUsdt: Number(row.boost_usdt || 0),
                sellMode: parseModeFlag(row.sell_mode),
                buyMode: parseModeFlag(row.buy_mode),
                sellMarginPct: Number(row.sell_margin_pct || 0),
                buyMarginPct: Number(row.buy_margin_pct || 0),
                sellPriceKrW: Number(row.sell_price_krw || 0),
                buyPriceKrW: Number(row.buy_price_krw || 0),
                depositUsdt: Number(row.deposit_usdt || 0),
                orderMinUsdt: Number(row.order_min_usdt || 0),
                orderMaxUsdt: Number(row.order_max_usdt || 0),
                network: row.network || 'TON',
                bankAccountId: row.bank_account_id || '',
                bankText: row.bank_text || '',
                tonWalletAddress: row.ton_wallet_address || '',
                tonWalletText: row.ton_wallet_text || '',
                createdAt: Number(row.created_at || 0),
                updatedAt: Number(row.updated_at || 0)
            };
        }

        async function fetchListingsFromSupabase() {
            var url = SUPABASE_URL + '/rest/v1/listings?select=*&order=boost_usdt.desc,created_at.desc';
            var res = await fetch(url, { headers: supabaseHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('supabase listings ' + res.status);
            var rows;
            try {
                rows = await res.json();
            } catch (e) {
                throw new Error('supabase listings json');
            }
            return (Array.isArray(rows) ? rows : []).map(fromSupabaseListing);
        }

        /** 단일 리스팅 최신값 조회(모드/가격 동기화용) */
        async function fetchListingByIdFromSupabase(listingId) {
            var id = String(listingId || '').trim();
            if (!id) return null;
            var url = SUPABASE_URL + '/rest/v1/listings?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1';
            var res = await fetch(url, { headers: supabaseHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('supabase listing by id ' + res.status);
            var rows = [];
            try {
                rows = await res.json();
            } catch (e) {
                rows = [];
            }
            if (!Array.isArray(rows) || !rows.length) return null;
            return fromSupabaseListing(rows[0]);
        }

        async function upsertListingToSupabase(record) {
            var url = SUPABASE_URL + '/rest/v1/listings?on_conflict=id';
            var payload = [toSupabaseListing(record)];
            var res = await fetch(url, {
                method: 'POST',
                headers: supabaseHeaders({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('supabase upsert ' + res.status);
            try {
                return await res.json();
            } catch (e) {
                return [];
            }
        }

        async function deleteListingFromSupabase(listingId) {
            var url = SUPABASE_URL + '/rest/v1/listings?id=eq.' + encodeURIComponent(String(listingId || ''));
            var res = await fetch(url, {
                method: 'DELETE',
                headers: supabaseHeaders({ 'Prefer': 'return=representation' })
            });
            if (!res.ok) throw new Error('supabase delete ' + res.status);
            // Supabase DELETE는 204(본문 없음)로 올 수 있으므로 JSON 파싱을 강제하지 않음
            var t = '';
            try { t = await res.text(); } catch (e) { t = ''; }
            if (!t) return [];
            try {
                var parsed = JSON.parse(t);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e2) {
                return [];
            }
        }

        async function listingExistsInSupabase(listingId) {
            var url = SUPABASE_URL + '/rest/v1/listings?select=id&id=eq.' + encodeURIComponent(String(listingId || ''));
            var res = await fetch(url, { headers: supabaseHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('supabase exists ' + res.status);
            var rows = await res.json();
            return Array.isArray(rows) && rows.length > 0;
        }

        /** 한 유저당 1개만 허용: 목록에서 해당 유저 소유 리스팅 1건 */
        function findOwnedListingForUser(listings, userId) {
            if (!userId || !Array.isArray(listings)) return null;
            var uid = String(userId);
            for (var i = 0; i < listings.length; i++) {
                var l = listings[i];
                if (!l) continue;
                if (String(l.ownerId) === uid) return l;
            }
            return null;
        }

        /** 로컬 우선 → 없으면 Supabase: 현재 텔레그램 유저가 이미 가진 리스팅 */
        async function getCurrentUserListingOrNull() {
            if (!currentUserId) return null;
            var fromLocal = findOwnedListingForUser(loadListings(), currentUserId);
            if (fromLocal) return fromLocal;
            try {
                var serverRows = await fetchListingsFromSupabase();
                return findOwnedListingForUser(serverRows, currentUserId);
            } catch (e) {
                return null;
            }
        }

        /** 마켓 헤더 리스팅 버튼: 이미 등록 시 비활성화 */
        async function updateListingRegisterBtnState() {
            var btn = document.querySelector('.listing-register-btn');
            var span = document.getElementById('listingBtnText');
            if (!btn) return;
            if (!currentUserId) {
                btn.disabled = false;
                btn.removeAttribute('aria-disabled');
                btn.removeAttribute('title');
                if (span) span.textContent = '리스팅';
                btn.classList.remove('listing-register-btn--disabled');
                return;
            }
            var owned = null;
            try {
                owned = await getCurrentUserListingOrNull();
            } catch (e) {
                owned = findOwnedListingForUser(loadListings(), currentUserId);
            }
            if (owned) {
                btn.disabled = true;
                btn.setAttribute('aria-disabled', 'true');
                btn.setAttribute('title', '이미 등록된 리스팅이 있습니다. 마켓 카드를 열어 수정하세요.');
                if (span) span.textContent = '등록됨';
                btn.classList.add('listing-register-btn--disabled');
            } else {
                btn.disabled = false;
                btn.removeAttribute('aria-disabled');
                btn.removeAttribute('title');
                if (span) span.textContent = '리스팅';
                btn.classList.remove('listing-register-btn--disabled');
            }
        }

        // Escape special characters for safe HTML rendering (display only)
        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Escape special characters for JS-string usage (onclick only)
        function escapeJsString(value) {
            return String(value)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/\r/g, '\\r')
                .replace(/\n/g, '\\n');
        }

        // 현재 텔레그램 사용자(소유자 체크용)
        let currentUserId = null;
        let currentUserName = 'User';

        // Bind Telegram user info into the UI
        function bindTelegramUser() {
            let userName = 'Web Test User';
            let userHandle = 'No username';
            let userInitial = '?';

            // If Telegram provided user info successfully
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
                const u = tg.initDataUnsafe.user;
                currentUserId = (u && typeof u.id !== 'undefined') ? u.id : null;
                const firstName = u.first_name || 'User';
                userName = u.username || firstName;
                userHandle = u.username ? '@' + u.username : '@' + firstName;
                userInitial = userName.charAt(0).toUpperCase();
            }

            currentUserName = userName;

            // Bind user info into specific DOM targets
            const sideName = document.getElementById('sideName');
            const sideAvatarInitial = document.getElementById('sideAvatarInitial');
            const myPageName = document.getElementById('myPageName');
            const myPageAvatarInitial = document.getElementById('myPageAvatarInitial');
            const myPageTgHandle = document.getElementById('myPageTgHandle');

            if (sideName) sideName.innerText = userName;
            if (sideAvatarInitial) sideAvatarInitial.innerText = userInitial;
            if (myPageName) myPageName.innerText = userName;
            if (myPageAvatarInitial) myPageAvatarInitial.innerText = userInitial;
            if (myPageTgHandle) myPageTgHandle.innerText = userHandle;
        }

        // --------------------------------------------------------
        // Screen switching logic (keeps existing global function names)
        const dom = {
            marketplaceView: document.getElementById('marketplaceView'),
            myPageView: document.getElementById('myPageView'),
            kycView: document.getElementById('kycView'),
            kycCompleteView: document.getElementById('kycCompleteView'),
            kycIdFile: document.getElementById('kycIdFile'),
            kycSelfieFile: document.getElementById('kycSelfieFile'),
            myPageSettingsMainView: document.getElementById('myPageSettingsMainView'),
            walletSettingsView: document.getElementById('walletSettingsView'),
            bankAccountsSettingsView: document.getElementById('bankAccountsSettingsView'),
            sideMenu: document.getElementById('sideMenu'),
            menuOverlay: document.getElementById('menuOverlay'),
            traderList: document.getElementById('traderList'),
            orderFlowView: document.getElementById('orderFlowView'),
            orderOwnerInitial: document.getElementById('orderOwnerInitial'),
            orderOwnerName: document.getElementById('orderOwnerName'),
            orderBuyPriceText: document.getElementById('orderBuyPriceText'),
            orderSellPriceText: document.getElementById('orderSellPriceText'),
            orderLimitText: document.getElementById('orderLimitText'),
            orderBuyTabBtn: document.getElementById('orderBuyTabBtn'),
            orderSellTabBtn: document.getElementById('orderSellTabBtn'),
            orderUsdtLabel: document.getElementById('orderUsdtLabel'),
            orderKrwLabel: document.getElementById('orderKrwLabel'),
            orderUsdtInput: document.getElementById('orderUsdtInput'),
            orderKrwInput: document.getElementById('orderKrwInput'),
            orderSubmitBtn: document.getElementById('orderSubmitBtn'),
            orderBuyWalletCard: document.getElementById('orderBuyWalletCard'),
            orderBuyNetworkCard: document.getElementById('orderBuyNetworkCard'),
            orderBuyNameCard: document.getElementById('orderBuyNameCard'),
            orderSellAccountCard: document.getElementById('orderSellAccountCard'),
            orderSellWalletCard: document.getElementById('orderSellWalletCard'),
            orderSellNetworkCard: document.getElementById('orderSellNetworkCard'),
            orderBuyReceiveWalletInput: document.getElementById('orderBuyReceiveWalletInput'),
            orderBuyDepositNameInput: document.getElementById('orderBuyDepositNameInput'),
            orderSellReceiveAccountInput: document.getElementById('orderSellReceiveAccountInput'),
            orderSellWalletAddressInput: document.getElementById('orderSellWalletAddressInput'),

            // Saved Lists
            savedWalletsCount: document.getElementById('savedWalletsCount'),
            walletsChevron: document.getElementById('walletsChevron'),
            walletsAccordionContent: document.getElementById('walletsAccordionContent'),
            tonWalletCards: document.getElementById('tonWalletCards'),
            savedBankAccountsCount: document.getElementById('savedBankAccountsCount'),
            banksChevron: document.getElementById('banksChevron'),
            banksAccordionContent: document.getElementById('banksAccordionContent'),
            bankAccountCards: document.getElementById('bankAccountCards'),

            tonWalletStatusText: document.getElementById('tonWalletStatusText'),
            tonConnectFallback: document.getElementById('tonConnectFallback'),
            tonConnectButtonRoot: document.getElementById('tonConnectButtonRoot'),
            walletAddressInput: document.getElementById('walletAddressInput'),
            walletLabelInput: document.getElementById('walletLabelInput'),
            usdtTestnetMasterInput: document.getElementById('usdtTestnetMasterInput'),
            setDefaultTonWalletSwitch: document.getElementById('setDefaultTonWalletSwitch'),
            walletSaveMsg: document.getElementById('walletSaveMsg'),
            bankNameSelect: document.getElementById('bankNameSelect'),
            bankAccountNumberInput: document.getElementById('bankAccountNumberInput'),
            bankAccountHolderInput: document.getElementById('bankAccountHolderInput'),
            bankAccountLabelInput: document.getElementById('bankAccountLabelInput'),
            setDefaultBankAccountSwitch: document.getElementById('setDefaultBankAccountSwitch'),
            bankSaveMsg: document.getElementById('bankSaveMsg'),
            mypageKycStatus: document.getElementById('mypageKycStatus'),
            mypageUsdtBalance: document.getElementById('mypageUsdtBalance'),

            // 리스팅 생성 (단일 화면)
            listingCreateView: document.getElementById('listingCreateView'),
            listingCreateRoot: document.getElementById('listingCreateRoot'),
            listingDepositUsdtInput: document.getElementById('listingDepositUsdtInput'),
            listingOrderMinInput: document.getElementById('listingOrderMinInput'),
            listingOrderMaxInput: document.getElementById('listingOrderMaxInput'),
            listingOrderHint: document.getElementById('listingOrderHint'),
            listingModeSell: document.getElementById('listingModeSell'),
            listingModeBuy: document.getElementById('listingModeBuy'),
            listingSellSection: document.getElementById('listingSellSection'),
            listingBuySection: document.getElementById('listingBuySection'),
            listingSellBody: document.getElementById('listingSellBody'),
            listingBuyBody: document.getElementById('listingBuyBody'),
            listingSellMarginInput: document.getElementById('listingSellMarginInput'),
            listingBuyMarginInput: document.getElementById('listingBuyMarginInput'),
            listingMarketPriceSell: document.getElementById('listingMarketPriceSell'),
            listingMarketPriceBuy: document.getElementById('listingMarketPriceBuy'),
            listingSellPriceText: document.getElementById('listingSellPriceText'),
            listingBuyPriceText: document.getElementById('listingBuyPriceText'),
            listingBankAccountSelect: document.getElementById('listingBankAccountSelect'),
            listingTonWalletSelect: document.getElementById('listingTonWalletSelect'),

            // 리스팅 상세/결제 Flow
            listingConfirmView: document.getElementById('listingConfirmView'),
            myOffersView: document.getElementById('myOffersView'),
            listingBoostUsdtText: document.getElementById('listingBoostUsdtText'),
            confirmDepositText: document.getElementById('confirmDepositText'),
            confirmOrderText: document.getElementById('confirmOrderText'),
            confirmSellBlock: document.getElementById('confirmSellBlock'),
            confirmSellPriceText: document.getElementById('confirmSellPriceText'),
            confirmSellBankText: document.getElementById('confirmSellBankText'),
            confirmBuyBlock: document.getElementById('confirmBuyBlock'),
            confirmBuyPriceText: document.getElementById('confirmBuyPriceText'),
            confirmBuyWalletText: document.getElementById('confirmBuyWalletText'),
            confirmCheckoutDepositText: document.getElementById('confirmCheckoutDepositText'),
            confirmCheckoutBoostText: document.getElementById('confirmCheckoutBoostText'),
            confirmCheckoutTotalText: document.getElementById('confirmCheckoutTotalText'),
            finalCompleteConfirmOverlay: document.getElementById('finalCompleteConfirmOverlay'),
            finalCompleteConfirmBtn: document.getElementById('finalCompleteConfirmBtn'),
        };

        // localStorage / CloudStorage 키 (KYC·지갑 등) — KYC 제출 로직보다 먼저 정의
        const STORAGE = {
            TON_WALLETS: 'tonWallets',
            DEFAULT_TON_WALLET_ADDRESS: 'defaultTonWalletAddress',
            LEGACY_DEFAULT_TON_WALLET: 'defaultTonWallet',
            BANK_ACCOUNTS: 'bankAccounts',
            DEFAULT_BANK_ACCOUNT_ID: 'defaultBankAccountId',
            /** 리스팅용 KYC(2차) 제출·완료 플래그 — 데모는 제출 시 true */
            KYC_TIER2_COMPLETE: 'kycTier2Complete',
            /** 등록된 리스팅(탑 트레이더/주문 카드) 목록 */
            LISTINGS: 'listings'
        };

        /** TonAPI 공개 API: TON 지갑 주소의 USDT(제톤) 잔액 */
        const TONAPI_ACCOUNT_JETTONS = 'https://tonapi.io/v2/accounts/';
        /** TonAPI 테스트넷 API: TON 테스트넷 지갑 주소의 USDT(제톤) 잔액 */
        const TONAPI_ACCOUNT_JETTONS_TESTNET = 'https://testnet.tonapi.io/v2/accounts/';
        /** TON 메인넷 Tether USD(USDT) 제톤 마스터(주소 일치로도 판별) */
        var USDT_JETTON_MASTER_MAINNET = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
        /** TON 테스트넷 JSON-RPC 엔드포인트 */
        const TONCENTER_TESTNET_RPC = 'https://testnet.toncenter.com/api/v2/jsonRPC';
        /** 테스트넷 USDT 제톤 마스터 주소(미입력 시 메인넷 마스터를 fallback로 사용) */
        const USDT_TESTNET_MASTER_STORAGE_KEY = 'usdtTestnetMasterAddress';
        let tonWebTestnetInstance = null;

        function normalizeJettonSymbol(sym) {
            return String(sym || '')
                .toUpperCase()
                .replace(/₮/g, 'T')
                .trim();
        }

        function isLikelyUsdtJetton(j) {
            if (!j || typeof j !== 'object') return false;
            var sym = normalizeJettonSymbol(j.symbol);
            var name = String(j.name || '').toUpperCase();
            var addr = String(j.address || '').trim();
            if (addr && addr.toLowerCase() === USDT_JETTON_MASTER_MAINNET.toLowerCase()) return true;
            if (sym === 'USDT' || sym.indexOf('USDT') !== -1) return true;
            if (name.indexOf('TETHER') !== -1) return true;
            if (name.indexOf('USDT') !== -1) return true;
            return false;
        }

        function getSavedUsdtTestnetMasterAddress() {
            try {
                return String(localStorage.getItem(USDT_TESTNET_MASTER_STORAGE_KEY) || '').trim();
            } catch (e) {
                return '';
            }
        }

        function isLikelyTestnetModeForUsdt() {
            // 테스트넷 마스터를 저장해둔 경우 테스트넷 조회를 우선
            if (getSavedUsdtTestnetMasterAddress()) return true;
            var account = getTonConnectAccountSnapshot();
            return !!(account && String(account.chain || '') === '-3');
        }

        function getUsdtBalanceQueryContext() {
            var useTestnet = isLikelyTestnetModeForUsdt();
            var testnetMaster = getSavedUsdtTestnetMasterAddress();
            return {
                baseUrl: useTestnet ? TONAPI_ACCOUNT_JETTONS_TESTNET : TONAPI_ACCOUNT_JETTONS,
                masterAddress: useTestnet ? testnetMaster : USDT_JETTON_MASTER_MAINNET
            };
        }

        function parseJettonBalanceNumber(b, j) {
            var raw = b.balance;
            if (raw == null) raw = '0';
            var rawStr = String(raw);
            var dec = typeof j.decimals === 'number' ? j.decimals : 6;
            var n = Number(rawStr) / Math.pow(10, dec);
            return Number.isFinite(n) ? n : 0;
        }

        /** TonAPI jettons 한 번 조회 */
        function fetchJettonUsdtBalanceOnce(address) {
            var ctx = getUsdtBalanceQueryContext();
            var url = ctx.baseUrl + encodeURIComponent(address.trim()) + '/jettons';
            return fetch(url, { cache: 'no-store', mode: 'cors' })
                .then(function (res) {
                    // 계정이 체인에 없거나 제톤 지갑이 없을 때 404가 올 수 있음 → 0으로 처리
                    if (res.status === 404) return { balances: [] };
                    if (!res.ok) throw new Error('tonapi ' + res.status);
                    return res.json();
                })
                .then(function (data) {
                    var list = data.balances || [];
                    // 1순위: 저장된(또는 기본) USDT 마스터 주소와 정확히 일치
                    if (ctx.masterAddress) {
                        var masterNorm = String(ctx.masterAddress).toLowerCase();
                        for (var k = 0; k < list.length; k++) {
                            var bk = list[k];
                            var jk = bk.jetton || {};
                            var addrK = String(jk.address || '').trim().toLowerCase();
                            if (addrK && addrK === masterNorm) {
                                return parseJettonBalanceNumber(bk, jk);
                            }
                        }
                    }
                    // 2순위: 심볼/이름 기반 fallback
                    for (var i = 0; i < list.length; i++) {
                        var b = list[i];
                        var j = b.jetton || {};
                        if (isLikelyUsdtJetton(j)) {
                            return parseJettonBalanceNumber(b, j);
                        }
                    }
                    return 0;
                });
        }

        /** USDT 잔액 조회(일시 오류 시 1회 재시도) */
        function fetchJettonUsdtBalance(address) {
            if (!address || !String(address).trim()) return Promise.resolve(null);
            var trimmed = String(address).trim();
            return fetchJettonUsdtBalanceOnce(trimmed).catch(function () {
                return fetchJettonUsdtBalanceOnce(trimmed);
            });
        }

        /** 마이페이지 배지: KYC 2차 완료 여부 */
        function updateMyPageKycUi() {
            var el = dom.mypageKycStatus || document.getElementById('mypageKycStatus');
            if (!el) return;
            var done = localStorage.getItem(STORAGE.KYC_TIER2_COMPLETE) === '1';
            el.textContent = done ? '완료' : '미완료';
            el.className = 'mypage-summary-badge ' + (done ? 'mypage-summary-badge--ok' : 'mypage-summary-badge--pending');

            var resetBtn = document.getElementById('kycResetBtn');
            if (resetBtn) resetBtn.disabled = !done;
        }

        // --------------------------------------------------------
        // My Page settings tab switching
        function showMyPageSettingsMain() {
            if (dom.myPageSettingsMainView) dom.myPageSettingsMainView.classList.remove('hidden');
            if (dom.walletSettingsView) dom.walletSettingsView.classList.add('hidden');
            if (dom.bankAccountsSettingsView) dom.bankAccountsSettingsView.classList.add('hidden');
        }

        function showMyPageSettingsWallet() {
            if (dom.myPageSettingsMainView) dom.myPageSettingsMainView.classList.add('hidden');
            if (dom.walletSettingsView) dom.walletSettingsView.classList.remove('hidden');
            if (dom.bankAccountsSettingsView) dom.bankAccountsSettingsView.classList.add('hidden');
        }

        function showMyPageSettingsBank() {
            if (dom.myPageSettingsMainView) dom.myPageSettingsMainView.classList.add('hidden');
            if (dom.walletSettingsView) dom.walletSettingsView.classList.add('hidden');
            if (dom.bankAccountsSettingsView) dom.bankAccountsSettingsView.classList.remove('hidden');
        }

        function openMenu() {
            if (!dom.sideMenu || !dom.menuOverlay) return;
            dom.menuOverlay.style.display = 'block';
            setTimeout(() => dom.sideMenu.classList.add('open'), 10);
        }

        function closeMenu() {
            if (!dom.sideMenu || !dom.menuOverlay) return;
            dom.sideMenu.classList.remove('open');
            setTimeout(() => dom.menuOverlay.style.display = 'none', 300);
        }

        function goToMyPage() {
            closeMenu();
            clearKycAlertTimer();
            closeListingDetail();
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.marketplaceView) dom.marketplaceView.classList.add('hidden');
            if (dom.myOffersView) dom.myOffersView.classList.add('hidden');
            if (dom.orderFlowView) dom.orderFlowView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.remove('hidden');
            showMyPageSettingsMain(); // Keep the default settings view on entry
            refreshMyPageSummary();
            // TonConnect 복원이 늦을 수 있어 잠시 후 잔액 재조회
            setTimeout(function () {
                try { refreshMyPageUsdtBalance(); } catch (e) {}
            }, 800);
        }

        function goToMarketplace() {
            closeMenu();
            clearKycAlertTimer();
            closeListingDetail();
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.myOffersView) dom.myOffersView.classList.add('hidden');
            if (dom.orderFlowView) dom.orderFlowView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.marketplaceView) dom.marketplaceView.classList.remove('hidden');
        }

        // --------------------------------------------------------
        // KYC (리스팅 등록) — 데모: 서버 업로드 없음, 제출 후 텔레그램 알림만
        const KYC_MAX_BYTES = 20 * 1024 * 1024;
        let kycAlertTimer = null;

        // KYC 2차(데모) 초기화
        function resetKycTier2() {
            var done = localStorage.getItem(STORAGE.KYC_TIER2_COMPLETE) === '1';
            if (!done) return;

            var ok = window.confirm('KYC 2차 인증을 초기화할까요? 초기화 후 다시 인증 화면이 표시됩니다.');
            if (!ok) return;

            try { localStorage.setItem(STORAGE.KYC_TIER2_COMPLETE, '0'); } catch (e) {}
            try { localStorage.removeItem(STORAGE.KYC_TIER2_COMPLETE); } catch (e) {}

            // CloudStorage에 저장/동기화 (미지원 환경이면 무시)
            try { cloudSetItem(STORAGE.KYC_TIER2_COMPLETE, '0'); } catch (e) {}

            updateMyPageKycUi();

            // 초기화 후 다시 인증 진행할 수 있도록 KYC 화면으로 이동
            openKycFlow();
        }

        function clearKycAlertTimer() {
            if (kycAlertTimer) {
                clearTimeout(kycAlertTimer);
                kycAlertTimer = null;
            }
        }

        function resetKycForm() {
            if (dom.kycIdFile) dom.kycIdFile.value = '';
            if (dom.kycSelfieFile) dom.kycSelfieFile.value = '';
            const idName = document.getElementById('kycIdFileName');
            const selfieName = document.getElementById('kycSelfieFileName');
            if (idName) idName.textContent = '';
            if (selfieName) selfieName.textContent = '';
            const zId = document.getElementById('kycZoneId');
            const zS = document.getElementById('kycZoneSelfie');
            if (zId) zId.classList.remove('has-file');
            if (zS) zS.classList.remove('has-file');
            const e1 = document.getElementById('kycIdErr');
            const e2 = document.getElementById('kycSelfieErr');
            if (e1) { e1.textContent = ''; e1.classList.add('hidden'); }
            if (e2) { e2.textContent = ''; e2.classList.add('hidden'); }
            const btn = document.getElementById('kycSubmitBtn');
            if (btn) btn.disabled = true;
        }

        function onKycFileChange(which) {
            const input = which === 'id' ? dom.kycIdFile : dom.kycSelfieFile;
            const errEl = document.getElementById(which === 'id' ? 'kycIdErr' : 'kycSelfieErr');
            const zone = document.getElementById(which === 'id' ? 'kycZoneId' : 'kycZoneSelfie');
            const nameEl = document.getElementById(which === 'id' ? 'kycIdFileName' : 'kycSelfieFileName');
            const f = input && input.files && input.files[0];

            if (!f) {
                if (nameEl) nameEl.textContent = '';
                if (zone) zone.classList.remove('has-file');
                if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
            } else if (f.size > KYC_MAX_BYTES) {
                if (errEl) {
                    errEl.textContent = '파일이 20MB를 초과했습니다.';
                    errEl.classList.remove('hidden');
                }
                if (nameEl) nameEl.textContent = f.name;
                if (zone) zone.classList.add('has-file');
            } else {
                if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
                if (nameEl) nameEl.textContent = f.name;
                if (zone) zone.classList.add('has-file');
            }

            const idF = dom.kycIdFile && dom.kycIdFile.files && dom.kycIdFile.files[0];
            const sF = dom.kycSelfieFile && dom.kycSelfieFile.files && dom.kycSelfieFile.files[0];
            const idOk = idF && idF.size <= KYC_MAX_BYTES;
            const selfieOk = sF && sF.size <= KYC_MAX_BYTES;
            const btn = document.getElementById('kycSubmitBtn');
            if (btn) btn.disabled = !(idOk && selfieOk);
        }

        function openKycFlow() {
            closeMenu();
            clearKycAlertTimer();

            // KYC 2차 완료 상태면 인증 화면을 더 이상 보여주지 않음
            var done = localStorage.getItem(STORAGE.KYC_TIER2_COMPLETE) === '1';
            if (done) {
                // 이미 인증이 완료된 경우, 리스팅 생성 화면으로 이동
                openListingCreateFlow();
                return;
            }

            if (dom.marketplaceView) dom.marketplaceView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.kycView) dom.kycView.classList.remove('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            resetKycForm();
        }

        function closeKycFlow() {
            clearKycAlertTimer();
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.marketplaceView) dom.marketplaceView.classList.remove('hidden');
            resetKycForm();
        }

        function goToMarketplaceFromKyc() {
            clearKycAlertTimer();
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.marketplaceView) dom.marketplaceView.classList.remove('hidden');
            resetKycForm();
        }

        function submitKycDemo() {
            const idF = dom.kycIdFile && dom.kycIdFile.files && dom.kycIdFile.files[0];
            const sF = dom.kycSelfieFile && dom.kycSelfieFile.files && dom.kycSelfieFile.files[0];
            if (!idF || !sF || idF.size > KYC_MAX_BYTES || sF.size > KYC_MAX_BYTES) return;

            // KYC 2차(데모): 제출 완료 시 로컬·클라우드에 완료 플래그 저장 → 마이페이지에 반영
            try {
                localStorage.setItem(STORAGE.KYC_TIER2_COMPLETE, '1');
                cloudSetItem(STORAGE.KYC_TIER2_COMPLETE, '1');
            } catch (e) {}
            updateMyPageKycUi();

            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.remove('hidden');

            clearKycAlertTimer();
            // 제출 완료 화면을 본 뒤 약 2초 후 텔레그램 네이티브 알림 (채팅 말풍선이 아님 — 봇 API 필요)
            kycAlertTimer = setTimeout(function () {
                kycAlertTimer = null;
                var msg = 'KYC인증이 완료 되었습니다';
                if (tg && typeof tg.showAlert === 'function') {
                    tg.showAlert(msg);
                } else {
                    window.alert(msg);
                }
                if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.notificationOccurred === 'function') {
                    try { tg.HapticFeedback.notificationOccurred('success'); } catch (e) {}
                }
            }, 2000);
        }

        // --------------------------------------------------------
        // 리스팅 생성 (KYC 2차 완료 후) — 단일 화면
        const LISTING_ORDER_MIN_USDT = 10;
        let listingFlowState = {
            basePriceKrW: null, // KRW 기준 USDT(테더) 시장 가격
            selectedNetwork: 'TON', // 고정 네트워크
            sellPriceKrW: null, // 계산된 매도 가격(KRW)
            buyPriceKrW: null, // 계산된 매수 가격(KRW)
            sellMarginPct: 1.0,
            buyMarginPct: 1.0
        };
        let listingInitPromise = null;

        // 리스팅 CRUD 컨텍스트 (생성/수정)
        let listingCrudState = {
            mode: 'create', // 'create' | 'edit'
            listingId: null
        };

        function formatKrw(n) {
            var num = Number(n);
            if (!Number.isFinite(num)) return '—';
            return '₩' + Math.floor(num).toLocaleString() + ' KRW';
        }

        async function initListingCreateData() {
            if (listingInitPromise) return listingInitPromise;
            listingInitPromise = (async function () {
                // 1) 시장 가격 불러오기 (KRW/USDT)
                try {
                    listingFlowState.basePriceKrW = await fetchBasePrice();
                } catch (e) {
                    listingFlowState.basePriceKrW = null;
                }

                var p = listingFlowState.basePriceKrW;
                var mp = p ? formatKrw(p) : '조회 실패';
                if (dom.listingMarketPriceSell) dom.listingMarketPriceSell.textContent = mp;
                if (dom.listingMarketPriceBuy) dom.listingMarketPriceBuy.textContent = mp;

                // 2) 은행 계좌 select 채우기
                try {
                    var accounts = loadBankAccounts ? loadBankAccounts() : [];
                    var defaultId = localStorage.getItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);
                    if (dom.listingBankAccountSelect) {
                        var opts = [];
                        if (!accounts || !accounts.length) {
                            opts.push('<option value="">저장된 계좌 없음</option>');
                        } else {
                            opts.push('<option value="">계좌를 선택해 주세요</option>');
                            accounts.forEach(function (a) {
                                var id = a.id;
                                var bank = a.bank || 'Bank';
                                var masked = a.accountNumber ? maskAccountNumber(a.accountNumber) : '';
                                var label = (a.label || bank) + (masked ? ' (' + masked + ')' : '');
                                var selected = defaultId && String(defaultId) === String(id) ? ' selected' : '';
                                opts.push('<option value="' + String(id) + '"' + selected + '>' + escapeHtml(label) + '</option>');
                            });
                        }
                        dom.listingBankAccountSelect.innerHTML = opts.join('');
                    }
                } catch (e) {
                    if (dom.listingBankAccountSelect) dom.listingBankAccountSelect.innerHTML = '<option value="">계좌 로드 실패</option>';
                }

                // 3) TON 지갑 select 채우기
                try {
                    var wallets = loadTonWallets ? loadTonWallets() : [];
                    var defaultTon = getDefaultTonWalletAddress ? getDefaultTonWalletAddress() : null;
                    if (dom.listingTonWalletSelect) {
                        var walletOpts = [];
                        if (!wallets || !wallets.length) {
                            walletOpts.push('<option value="">저장된 지갑 없음</option>');
                        } else {
                            walletOpts.push('<option value="">지갑을 선택해 주세요</option>');
                            wallets.forEach(function (w) {
                                if (!isValidTonAddressStrict(w.address)) return;
                                var selected = defaultTon && w.address === defaultTon ? ' selected' : '';
                                var normalized = normalizeTonAddressStrict(w.address);
                                var label = (w.label || 'TON Wallet') + ' (' + shortenAddress(normalized) + ')';
                                walletOpts.push('<option value="' + escapeHtml(normalized) + '"' + selected + '>' + escapeHtml(label) + '</option>');
                            });
                        }
                        dom.listingTonWalletSelect.innerHTML = walletOpts.join('');
                    }
                } catch (e) {
                    if (dom.listingTonWalletSelect) dom.listingTonWalletSelect.innerHTML = '<option value="">지갑 로드 실패</option>';
                }

                // 4) 가격 계산
                listingFlowState.selectedNetwork = 'TON';
                recalcListingPrices();
            })();
            return listingInitPromise;
        }

        // --------------------------------------------------------
        // 리스팅 상세/결제 (부스트) Flow
        const LISTING_BOOST_UNIT_USDT = 100; // 단위: 100 USDT
        const LISTING_BOOST_MIN_USDT = 0;   // 최소: 0 USDT
        let listingConfirmState = {
            depositUsdt: 0,
            orderMinUsdt: LISTING_ORDER_MIN_USDT,
            orderMaxUsdt: 0,
            sellMode: true,
            buyMode: true,
            network: 'TON',
            sellPriceKrW: null,
            buyPriceKrW: null,
            sellMarginPct: 1.0,
            buyMarginPct: 1.0,
            bankText: '',
            bankAccountId: '',
            bankName: '',
            bankAccountNumber: '',
            bankAccountHolder: '',
            tonWalletText: '',
            tonWalletAddress: '',
            boostUsdt: 0,
            boostMaxUsdt: 0,

            // CRUD 컨텍스트
            crudMode: 'create', // 'create' | 'edit'
            editListingId: null
        };

        function backToListingCreate() {
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.remove('hidden');
            resetScrollTop();
        }

        function resetScrollTop() {
            try { window.scrollTo(0, 0); } catch (e) {}
            try {
                var el = document.scrollingElement || document.documentElement;
                if (el) el.scrollTop = 0;
            } catch (e) {}
        }

        function updateListingConfirmUi() {
            if (!dom.listingConfirmView) return;

            var s = listingConfirmState;

            if (dom.confirmDepositText) dom.confirmDepositText.textContent = Number(s.depositUsdt).toLocaleString() + ' USDT';
            if (dom.confirmOrderText) dom.confirmOrderText.textContent = s.orderMinUsdt + '-' + s.orderMaxUsdt + ' USDT';

            // 매도/매수 블록 토글
            if (dom.confirmSellBlock) dom.confirmSellBlock.classList.toggle('hidden', !s.sellMode);
            if (dom.confirmBuyBlock) dom.confirmBuyBlock.classList.toggle('hidden', !s.buyMode);

            if (dom.confirmSellPriceText) {
                var sellT = s.sellPriceKrW != null ? formatKrw(s.sellPriceKrW) : '—';
                if (Number.isFinite(Number(s.sellMarginPct))) sellT += ' · ' + Number(s.sellMarginPct).toFixed(1) + '%';
                dom.confirmSellPriceText.textContent = sellT;
            }
            if (dom.confirmBuyPriceText) {
                var buyT = s.buyPriceKrW != null ? formatKrw(s.buyPriceKrW) : '—';
                if (Number.isFinite(Number(s.buyMarginPct))) buyT += ' · ' + Number(s.buyMarginPct).toFixed(1) + '%';
                dom.confirmBuyPriceText.textContent = buyT;
            }

            if (dom.confirmSellBankText) dom.confirmSellBankText.textContent = s.bankText || '—';
            if (dom.confirmBuyWalletText) dom.confirmBuyWalletText.textContent = s.tonWalletText || '—';

            if (dom.listingBoostUsdtText) dom.listingBoostUsdtText.textContent = Number(s.boostUsdt).toLocaleString();

            if (dom.confirmCheckoutDepositText) dom.confirmCheckoutDepositText.textContent = Number(s.depositUsdt).toLocaleString() + ' USDT';
            if (dom.confirmCheckoutBoostText) dom.confirmCheckoutBoostText.textContent = Number(s.boostUsdt).toLocaleString() + ' USDT';
            if (dom.confirmCheckoutTotalText) dom.confirmCheckoutTotalText.textContent = (Number(s.depositUsdt) + Number(s.boostUsdt)).toLocaleString() + ' USDT';
        }

        function openListingConfirmViewFromCreate() {
            // 입력 검증은 submitListingCreate()에서 이미 수행한다고 가정
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.remove('hidden');
            resetScrollTop();
            updateListingConfirmUi();
        }

        function adjustListingBoost(delta) {
            var s = listingConfirmState;
            var next = Number(s.boostUsdt) + Number(delta);
            if (!Number.isFinite(next)) next = 0;

            // 단위 100USDT 고정
            next = Math.round(next / LISTING_BOOST_UNIT_USDT) * LISTING_BOOST_UNIT_USDT;

            if (next < LISTING_BOOST_MIN_USDT) next = LISTING_BOOST_MIN_USDT;
            if (s.boostMaxUsdt > 0 && next > s.boostMaxUsdt) next = s.boostMaxUsdt;

            s.boostUsdt = next;
            updateListingConfirmUi();
        }

        async function submitListingBoostPayment() {
            // 데모: 결제 즉시 완료 처리 → 리스팅 등록(또는 수정)
            if (localStorage.getItem(STORAGE.KYC_TIER2_COMPLETE) !== '1') {
                openKycFlow();
                return;
            }
            if (!currentUserId) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('텔레그램 사용자 정보가 필요합니다.');
                else alert('텔레그램 사용자 정보가 필요합니다.');
                return;
            }

            var s = listingConfirmState;
            var now = Date.now();
            var isEdit = s.crudMode === 'edit' && s.editListingId;

            // 신규 등록 시에만: 서버/로컬에 동일 유저 리스팅이 이미 있으면 차단(이중 등록 방지)
            if (!isEdit) {
                try {
                    var dupListing = await getCurrentUserListingOrNull();
                    if (dupListing) {
                        var msgDupPay = '이미 등록된 리스팅이 있습니다. 새 리스팅은 등록할 수 없습니다.';
                        if (tg && typeof tg.showAlert === 'function') tg.showAlert(msgDupPay);
                        else alert(msgDupPay);
                        return;
                    }
                } catch (eDupPay) {}
            }

            var listings = loadListings();
            listings = Array.isArray(listings) ? listings : [];

            var nextId = isEdit ? s.editListingId : (String(now) + '_' + Math.random().toString(16).slice(2));

            var existingIdx = listings.findIndex(function (l) { return String(l.id) === String(nextId); });
            if (isEdit && existingIdx >= 0) {
                // 소유자 검증
                if (String(listings[existingIdx].ownerId) !== String(currentUserId)) {
                    if (tg && typeof tg.showAlert === 'function') tg.showAlert('본인의 리스팅만 수정할 수 있습니다.');
                    else alert('본인의 리스팅만 수정할 수 있습니다.');
                    return;
                }
            }

            var record = {
                id: nextId,
                ownerId: currentUserId,
                ownerName: currentUserName,
                createdAt: isEdit && existingIdx >= 0 ? listings[existingIdx].createdAt : now,
                updatedAt: now,

                depositUsdt: Number(s.depositUsdt || 0),
                orderMinUsdt: Number(s.orderMinUsdt || LISTING_ORDER_MIN_USDT),
                orderMaxUsdt: Number(s.orderMaxUsdt || 0),

                sellMode: !!s.sellMode,
                buyMode: !!s.buyMode,
                sellMarginPct: Number(s.sellMarginPct || 0),
                buyMarginPct: Number(s.buyMarginPct || 0),
                sellPriceKrW: s.sellPriceKrW,
                buyPriceKrW: s.buyPriceKrW,

                network: 'TON',
                bankAccountId: s.bankAccountId || '',
                bankText: s.bankText || '',
                bankName: s.bankName || '',
                bankAccountNumber: s.bankAccountNumber || '',
                bankAccountHolder: s.bankAccountHolder || '',
                tonWalletAddress: s.tonWalletAddress || '',
                tonWalletText: s.tonWalletText || '',

                boostUsdt: Number(s.boostUsdt || 0)
            };

            // 1) 서버 먼저 저장 시도 (성공하면 서버 목록이 갱신됨)
            var serverPosted = false;
            try {
                await upsertListingToSupabase(record);
                serverPosted = true;
            } catch (e) {
                serverPosted = false;
            }

            // 2) 로컬에도 저장(서버 실패 시 fallback, 그리고 즉시 수정 프리필용)
            if (isEdit && existingIdx >= 0) {
                listings[existingIdx] = record;
            } else {
                listings.unshift(record);
            }

            saveListings(listings);
            closeListingDetail();
            if (tg && typeof tg.showAlert === 'function') {
                tg.showAlert('리스팅 ' + (isEdit ? '수정' : '등록') + ' 완료' + (serverPosted ? '' : '(로컬)') + '!');
            } else {
                alert('리스팅 ' + (isEdit ? '수정' : '등록') + ' 완료' + (serverPosted ? '' : '(로컬)') + '!');
            }

            // 마켓으로 복귀하고 목록 갱신
            goToMarketplace();
            loadMarketplace();
        }

        function closeListingCreateFlow() {
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.marketplaceView) dom.marketplaceView.classList.remove('hidden');
        }

        async function openListingCreateFlow() {
            // KYC 2차 미완료면 KYC부터 다시 진행
            var done = localStorage.getItem(STORAGE.KYC_TIER2_COMPLETE) === '1';
            if (!done) {
                openKycFlow();
                return;
            }

            // 계정당 리스팅 1개: 이미 있으면 신규 등록 차단
            if (currentUserId) {
                try {
                    var existingOwn = await getCurrentUserListingOrNull();
                    if (existingOwn) {
                        var msgOwn = '이미 등록된 리스팅이 있습니다. 한 계정당 리스팅은 하나만 등록할 수 있습니다.\n\n기존 리스팅을 수정하려면 마켓에서 내 리스팅 카드를 눌러 주세요.';
                        if (tg && typeof tg.showAlert === 'function') tg.showAlert(msgOwn);
                        else alert(msgOwn);
                        return;
                    }
                } catch (eOwn) {}
            }

            listingCrudState.mode = 'create';
            listingCrudState.listingId = null;

            closeMenu();
            clearKycAlertTimer();

            // 매번 열 때 최신 시장가/계좌/지갑을 다시 로드
            listingInitPromise = null;
            listingFlowState.basePriceKrW = null;

            if (dom.marketplaceView) dom.marketplaceView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');

            if (dom.listingCreateView) dom.listingCreateView.classList.remove('hidden');

            // 기본: 매도·매수 모두 선택 (최소 하나는 항상 유지)
            if (dom.listingModeSell) dom.listingModeSell.checked = true;
            if (dom.listingModeBuy) dom.listingModeBuy.checked = true;
            if (dom.listingOrderMinInput) dom.listingOrderMinInput.value = formatListingNumber(LISTING_ORDER_MIN_USDT);
            if (dom.listingOrderMaxInput) dom.listingOrderMaxInput.value = '';
            if (dom.listingDepositUsdtInput) dom.listingDepositUsdtInput.value = '';
            updateListingTradeUi();
            onListingDepositInput();

            // 데이터 준비(시장 가격/계좌/지갑/네트워크)
            initListingCreateData();
        }

        // --------------------------------------------------------
        // 리스팅 편집
        async function openListingEdit(listingId) {
            if (!listingId) return;
            var listings = loadListings();
            var found = listings.find(function (l) { return String(l.id) === String(listingId); });

            // 로컬에 없으면 서버 목록에서 찾아서 편집 가능하게 처리
            if (!found) {
                try {
                    var serverListings = await fetchListingsFromSupabase();
                    found = (Array.isArray(serverListings) ? serverListings : []).find(function (l) {
                        return String(l.id) === String(listingId);
                    });
                } catch (e) {}
            }

            if (!found) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('존재하지 않는 리스팅입니다.');
                else alert('존재하지 않는 리스팅입니다.');
                return;
            }

            // 소유자만 편집 가능
            if (String(found.ownerId) !== String(currentUserId)) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('본인의 리스팅만 수정할 수 있습니다.');
                else alert('본인의 리스팅만 수정할 수 있습니다.');
                return;
            }

            listingCrudState.mode = 'edit';
            listingCrudState.listingId = found.id;

            // 화면 전환
            closeMenu();
            clearKycAlertTimer();
            if (dom.marketplaceView) dom.marketplaceView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.remove('hidden');

            // 선택/입력 값 프리필
            listingInitPromise = null;
            listingFlowState.basePriceKrW = null;
            initListingCreateData().then(function () {
                if (dom.listingDepositUsdtInput) dom.listingDepositUsdtInput.value = Number(found.depositUsdt || 0) > 0 ? formatListingNumber(found.depositUsdt) : '';
                if (dom.listingOrderMinInput) dom.listingOrderMinInput.value = formatListingNumber(found.orderMinUsdt || LISTING_ORDER_MIN_USDT);
                if (dom.listingOrderMaxInput) dom.listingOrderMaxInput.value = Number(found.orderMaxUsdt || 0) > 0 ? formatListingNumber(found.orderMaxUsdt) : '';

                if (dom.listingModeSell) dom.listingModeSell.checked = !!found.sellMode;
                if (dom.listingModeBuy) dom.listingModeBuy.checked = !!found.buyMode;

                if (dom.listingSellMarginInput && Number.isFinite(Number(found.sellMarginPct))) dom.listingSellMarginInput.value = Number(found.sellMarginPct).toFixed(1);
                if (dom.listingBuyMarginInput && Number.isFinite(Number(found.buyMarginPct))) dom.listingBuyMarginInput.value = Number(found.buyMarginPct).toFixed(1);

                updateListingTradeUi();
                recalcListingPrices();
                onListingDepositInput();

                // select 값 세팅 (옵션 로드 후)
                if (dom.listingBankAccountSelect) dom.listingBankAccountSelect.value = found.bankAccountId || '';
                if (dom.listingTonWalletSelect) dom.listingTonWalletSelect.value = found.tonWalletAddress || '';
            });
        }

        function setListingActiveNetwork(network) {
            listingFlowState.selectedNetwork = network;
            var root = dom.listingCreateRoot || document.getElementById('listingCreateRoot');
            var chips = root ? root.querySelectorAll('.network-chip') : document.querySelectorAll('#listingCreateView .network-chip');
            chips.forEach(function (el) {
                var net = el.getAttribute('data-network');
                if (!net) return;
                if (net === network) el.classList.add('active');
                else el.classList.remove('active');
            });
        }

        function selectListingNetwork(btnEl) {
            if (!btnEl) return;
            var net = btnEl.getAttribute('data-network');
            if (!net) return;
            setListingActiveNetwork(net);
        }

        /** 매도/매수 체크: 둘 다 해제 불가 — 최소 하나는 반드시 선택 */
        function onListingTradeModeChange(which) {
            var sellOn = dom.listingModeSell && dom.listingModeSell.checked;
            var buyOn = dom.listingModeBuy && dom.listingModeBuy.checked;
            if (!sellOn && !buyOn) {
                if (which === 'sell' && dom.listingModeSell) dom.listingModeSell.checked = true;
                else if (which === 'buy' && dom.listingModeBuy) dom.listingModeBuy.checked = true;
                var msg = '매도·매수 중 최소 하나는 선택해야 합니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                else alert(msg);
                return;
            }
            updateListingTradeUi();
            recalcListingPrices();
        }

        /** 체크 해제 시 본문만 비활성(체크박스는 항상 조작 가능) */
        function updateListingTradeUi() {
            var sellSel = dom.listingModeSell && dom.listingModeSell.checked;
            var buySel = dom.listingModeBuy && dom.listingModeBuy.checked;
            if (dom.listingSellBody) dom.listingSellBody.classList.toggle('listing-block-muted', !sellSel);
            if (dom.listingBuyBody) dom.listingBuyBody.classList.toggle('listing-block-muted', !buySel);
        }

        /** 예치금 변경 시 주문 최대값 상한 안내·클램프 */
        function onListingDepositInput() {
            var d = dom.listingDepositUsdtInput ? parseListingNumber(dom.listingDepositUsdtInput.value) : NaN;
            if (dom.listingDepositUsdtInput) {
                dom.listingDepositUsdtInput.value = Number.isFinite(d) && d > 0 ? formatListingNumber(d) : '';
            }
            if (dom.listingOrderHint) {
                if (Number.isFinite(d) && d >= LISTING_ORDER_MIN_USDT) {
                    dom.listingOrderHint.textContent = '최소 ' + LISTING_ORDER_MIN_USDT + ' USDT · 최대는 예치금(' + formatListingNumber(d) + ' USDT) 이하입니다.';
                } else {
                    dom.listingOrderHint.textContent = '최소 ' + LISTING_ORDER_MIN_USDT + ' USDT · 최대는 예치금을 넘을 수 없습니다.';
                }
            }
            onListingOrderMaxInput();
        }

        function onListingOrderMaxInput() {
            var deposit = dom.listingDepositUsdtInput ? parseListingNumber(dom.listingDepositUsdtInput.value) : NaN;
            var maxVal = dom.listingOrderMaxInput ? parseListingNumber(dom.listingOrderMaxInput.value) : NaN;
            if (!Number.isFinite(deposit) || deposit < LISTING_ORDER_MIN_USDT) return;
            if (Number.isFinite(maxVal) && maxVal > deposit && dom.listingOrderMaxInput) {
                dom.listingOrderMaxInput.value = formatListingNumber(deposit);
                return;
            }
            if (dom.listingOrderMaxInput) {
                dom.listingOrderMaxInput.value = Number.isFinite(maxVal) && maxVal > 0 ? formatListingNumber(maxVal) : '';
            }
        }

        function recalcListingPrices() {
            var base = listingFlowState.basePriceKrW;
            if (!base) return;

            // 매도(USDT 매도): 시장가 + 마진(%)
            var sellMargin = dom.listingSellMarginInput ? parseFloat(dom.listingSellMarginInput.value) : 1.0;
            if (!Number.isFinite(sellMargin)) sellMargin = 1.0;
            var sellPrice = base * (1 + (sellMargin / 100));
            listingFlowState.sellPriceKrW = sellPrice;
            listingFlowState.sellMarginPct = sellMargin;
            if (dom.listingSellPriceText) dom.listingSellPriceText.textContent = formatKrw(sellPrice);

            // 매수(USDT 매수): 시장가 - 마진(%)
            var buyMargin = dom.listingBuyMarginInput ? parseFloat(dom.listingBuyMarginInput.value) : 1.0;
            if (!Number.isFinite(buyMargin)) buyMargin = 1.0;
            var buyPrice = base * (1 - (buyMargin / 100));
            listingFlowState.buyPriceKrW = buyPrice;
            listingFlowState.buyMarginPct = buyMargin;
            if (dom.listingBuyPriceText) dom.listingBuyPriceText.textContent = formatKrw(buyPrice);
        }

        function adjustListingSellMargin(delta) {
            if (!dom.listingSellMarginInput) return;
            var v = parseFloat(dom.listingSellMarginInput.value);
            if (!Number.isFinite(v)) v = 1.0;
            v = v + delta;
            if (v < 0) v = 0;
            if (v > 50) v = 50;
            dom.listingSellMarginInput.value = v.toFixed(1);
            recalcListingPrices();
        }

        function adjustListingBuyMargin(delta) {
            if (!dom.listingBuyMarginInput) return;
            var v = parseFloat(dom.listingBuyMarginInput.value);
            if (!Number.isFinite(v)) v = 1.0;
            v = v + delta;
            if (v < 0) v = 0;
            if (v > 50) v = 50;
            dom.listingBuyMarginInput.value = v.toFixed(1);
            recalcListingPrices();
        }

        function onListingBankAccountChange() {
            // 데모: 필요 시 localStorage에 저장하도록 확장 가능
        }

        function onListingTonWalletChange() {
            // 데모: 필요 시 localStorage에 저장하도록 확장 가능
        }

        async function submitListingCreate() {
            var done = localStorage.getItem(STORAGE.KYC_TIER2_COMPLETE) === '1';
            if (!done) {
                openKycFlow();
                return;
            }

            // 신규 등록만: 동일 유저 리스팅이 이미 있으면 결제 단계로도 가지 않음
            if (listingCrudState.mode === 'create' && currentUserId) {
                try {
                    var hasListing = await getCurrentUserListingOrNull();
                    if (hasListing) {
                        var msgDupCreate = '이미 등록된 리스팅이 있습니다. 한 계정당 리스팅은 하나만 등록할 수 있습니다.\n\n기존 리스팅을 수정하려면 마켓에서 내 리스팅 카드를 눌러 주세요.';
                        if (tg && typeof tg.showAlert === 'function') tg.showAlert(msgDupCreate);
                        else alert(msgDupCreate);
                        return;
                    }
                } catch (eDupCreate) {}
            }

            var deposit = dom.listingDepositUsdtInput ? parseListingNumber(dom.listingDepositUsdtInput.value) : NaN;
            var min = LISTING_ORDER_MIN_USDT;
            var max = dom.listingOrderMaxInput ? parseListingNumber(dom.listingOrderMaxInput.value) : NaN;
            var sellMode = dom.listingModeSell && dom.listingModeSell.checked;
            var buyMode = dom.listingModeBuy && dom.listingModeBuy.checked;

            if (!Number.isFinite(deposit) || deposit < LISTING_ORDER_MIN_USDT) {
                var msg1 = '예치금은 ' + LISTING_ORDER_MIN_USDT + ' USDT 이상으로 입력해 주세요.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg1);
                else alert(msg1);
                return;
            }
            if (!Number.isFinite(max) || max < min || max > deposit) {
                var msg2 = '주문 한도: 최소 ' + min + ' USDT, 최대는 예치금(' + formatListingNumber(deposit) + ' USDT) 이하로 입력해 주세요.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg2);
                else alert(msg2);
                return;
            }
            if (!sellMode && !buyMode) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('매도 또는 매수 중 하나를 선택해 주세요.');
                else alert('매도 또는 매수 중 하나를 선택해 주세요.');
                return;
            }

            var net = listingFlowState.selectedNetwork;
            var bankId = dom.listingBankAccountSelect ? dom.listingBankAccountSelect.value : '';
            var tonWallet = dom.listingTonWalletSelect ? dom.listingTonWalletSelect.value : '';

            if (sellMode && !bankId) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('매도가 선택된 경우 입금 계좌를 선택해 주세요.');
                else alert('매도가 선택된 경우 입금 계좌를 선택해 주세요.');
                return;
            }
            if (buyMode && !tonWallet) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('매수가 선택된 경우 입금 지갑을 선택해 주세요.');
                else alert('매수가 선택된 경우 입금 지갑을 선택해 주세요.');
                return;
            }

            // 리스팅 상세/결제 화면으로 이동
            var bankAccountId = dom.listingBankAccountSelect ? dom.listingBankAccountSelect.value : '';
            var bankText = '';
            var selectedBank = null;
            if (bankAccountId) {
                var accounts = loadBankAccounts();
                selectedBank = (Array.isArray(accounts) ? accounts : []).find(function (a) {
                    return String(a.id) === String(bankAccountId);
                });
                if (selectedBank) {
                    // 구매자에게 전달될 계좌 정보는 전체 값을 저장
                    bankText = String(selectedBank.bank || '') + ' | ' +
                        String(selectedBank.accountNumber || '') + ' | ' +
                        String(selectedBank.accountHolder || '');
                }
            }
            if (!bankText && dom.listingBankAccountSelect && dom.listingBankAccountSelect.selectedIndex >= 0) {
                // 구데이터/예외 상황 fallback
                bankText = dom.listingBankAccountSelect.options[dom.listingBankAccountSelect.selectedIndex].textContent || '';
            }
            var tonWalletText = '';
            if (dom.listingTonWalletSelect && dom.listingTonWalletSelect.selectedIndex >= 0) {
                tonWalletText = dom.listingTonWalletSelect.options[dom.listingTonWalletSelect.selectedIndex].textContent || '';
            }
            var tonWalletAddress = dom.listingTonWalletSelect ? dom.listingTonWalletSelect.value : '';

            listingConfirmState.depositUsdt = deposit;
            listingConfirmState.orderMaxUsdt = max;
            listingConfirmState.sellMode = !!sellMode;
            listingConfirmState.buyMode = !!buyMode;
            listingConfirmState.network = 'TON';
            listingConfirmState.sellPriceKrW = listingFlowState.sellPriceKrW;
            listingConfirmState.buyPriceKrW = listingFlowState.buyPriceKrW;
            listingConfirmState.sellMarginPct = listingFlowState.sellMarginPct;
            listingConfirmState.buyMarginPct = listingFlowState.buyMarginPct;
            listingConfirmState.bankText = bankText;
            listingConfirmState.bankAccountId = bankAccountId;
            // 주문 단계에서 정확한 계좌 정보를 전달하기 위해 원본 필드를 별도로 저장
            listingConfirmState.bankName = selectedBank ? String(selectedBank.bank || '') : '';
            listingConfirmState.bankAccountNumber = selectedBank ? String(selectedBank.accountNumber || '') : '';
            listingConfirmState.bankAccountHolder = selectedBank ? String(selectedBank.accountHolder || '') : '';
            listingConfirmState.tonWalletText = tonWalletText;
            listingConfirmState.tonWalletAddress = tonWalletAddress;
            listingConfirmState.boostUsdt = 0;
            listingConfirmState.boostMaxUsdt = Math.floor(deposit / LISTING_BOOST_UNIT_USDT) * LISTING_BOOST_UNIT_USDT;

            listingConfirmState.crudMode = listingCrudState.mode;
            listingConfirmState.editListingId = listingCrudState.listingId;

            openListingConfirmViewFromCreate();
        }

        // --------------------------------------------------------
        // Marketplace trader list generation
        const UPBIT_TICKER_URL = 'https://api.upbit.com/v1/ticker?markets=KRW-USDT';
        /** CoinGecko — 브라우저 CORS가 Upbit보다 잘 열려 있는 경우가 많음 */
        const COINGECKO_USDT_KRW = 'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw';
        /** 모든 시세 API 실패 시 참고용 (대략적인 KRW/USDT 구간) */
        const FALLBACK_KRW_USDT = 1450;

        /**
         * KRW 기준 USDT 참고가. Upbit → CoinGecko → 고정값 순으로 시도.
         * (텔레그램 웹뷰·일부 환경에서는 Upbit가 CORS로 막혀 실패할 수 있음)
         */
        async function fetchBasePrice() {
            try {
                const response = await fetch(UPBIT_TICKER_URL, { cache: 'no-store' });
                if (response.ok) {
                    var data;
                    try {
                        data = await response.json();
                    } catch (eJson) {
                        data = null;
                    }
                    const basePrice = data && data[0] ? Number(data[0].trade_price) : NaN;
                    if (Number.isFinite(basePrice) && basePrice > 0) return basePrice;
                }
            } catch (e) {
                console.warn('Upbit 시세 실패 (CORS/네트워크 등):', e);
            }

            try {
                const response = await fetch(COINGECKO_USDT_KRW, { cache: 'no-store' });
                if (response.ok) {
                    var dataCg;
                    try {
                        dataCg = await response.json();
                    } catch (eJson2) {
                        dataCg = null;
                    }
                    const p = dataCg && dataCg.tether && typeof dataCg.tether.krw === 'number' ? dataCg.tether.krw : NaN;
                    if (Number.isFinite(p) && p > 0) return p;
                }
            } catch (e) {
                console.warn('CoinGecko 시세 실패:', e);
            }

            console.warn('시세 API 모두 실패 — 참고 고정가 사용:', FALLBACK_KRW_USDT);
            return FALLBACK_KRW_USDT;
        }

        async function loadMarketplace() {
            try {
                if (!dom.traderList) return;

                var listings = [];

                // Supabase 우선: 모든 사용자가 같은 리스팅 목록을 보도록 처리
                try {
                    var serverListings = await fetchListingsFromSupabase();
                    if (Array.isArray(serverListings)) listings = serverListings.slice();
                } catch (e) {
                    // Supabase 호출 실패 시 로컬 fallback 사용
                    listings = [];
                }

                // 서버 데이터가 비어 있거나 실패하면 기존 로컬 저장소를 fallback으로 사용
                if (!Array.isArray(listings) || !listings.length) {
                    listings = loadListings();
                    listings = Array.isArray(listings) ? listings.slice() : [];
                }

                // 예전 데모용 가상 트레이더(supabase·로컬 잔존) 제외
                listings = listings.filter(function (l) {
                    var oid = String(l && l.ownerId || '');
                    return oid !== 'virtual_gdragon' && oid !== 'virtual_superman';
                });

                // 부스트 높은 순 → 최신 순
                listings.sort(function (a, b) {
                    var db = Number(b.boostUsdt || 0) - Number(a.boostUsdt || 0);
                    if (db !== 0) return db;
                    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
                });

                if (!listings.length) {
                    dom.traderList.innerHTML =
                        "<div style='text-align:center;color:#94a3b8;padding:50px;font-size:14px;'>" +
                        "아직 등록된 리스팅이 없습니다.<br/>" +
                        "리스팅을 생성해 거래를 시작해 보세요." +
                        "</div>";
                    return;
                }

                var createListingCardHtml = function (l, index) {
                    var rank = index + 1;
                    var rankHtml = rank === 1
                        ? "<div class=\"rank rank--first\"><span class=\"crown\" aria-hidden=\"true\">👑</span><span class=\"rank-badge\">TOP</span><span class=\"rank-num\">#1</span></div>"
                        : "<div class=\"rank\">#" + rank + "</div>";

                    var ownerName = escapeHtml(l.ownerName || 'User');
                    var initial = escapeHtml(String(ownerName).charAt(0).toUpperCase() || '?');
                    var idForJs = escapeJsString(l.id);

                    // 내 리스팅이면 카드에서는 주문 버튼 숨김(대신 모달에서 수정/삭제 가능)
                    var isOwner = currentUserId != null && String(l.ownerId) === String(currentUserId);
                    var cardVariantClass = rank === 1 ? 'trader-card--top' : 'trader-card--sub';

                    var sellModeOn = parseModeFlag(l && l.sellMode);
                    var buyModeOn = parseModeFlag(l && l.buyMode);
                    var buyNum = buyModeOn ? Math.floor(Number(l.buyPriceKrW || 0)) : null;
                    var sellNum = sellModeOn ? Math.floor(Number(l.sellPriceKrW || 0)) : null;
                    var orderMin = Math.floor(Number(l.orderMinUsdt || 0));
                    var orderMax = Math.floor(Number(l.orderMaxUsdt || 0));
                    var orderTxt = orderMin.toLocaleString() + "-" + orderMax.toLocaleString() + " USDT";
                    var boostNum = Math.floor(Number(l.boostUsdt || 0));
                    var boostTxt = boostNum.toLocaleString() + " USDT";

                    var hasAnyMode = sellModeOn || buyModeOn;
                    var preferredSide = sellModeOn ? 'buy' : 'sell';
                    var offerBtnHtml = (isOwner || !hasAnyMode)
                        ? ''
                        : `<button class="make-offer-btn" type="button" onclick="event.stopPropagation(); openOrderFlow('${idForJs}', '${preferredSide}')">주문</button>`;

                    return `
                        <div class="trader-card ${cardVariantClass}" onclick="openListingDetail('${idForJs}')">
                            ${rankHtml}
                            <div class="profile-row">
                                <div class="avatar">${initial}</div>
                                <div class="trader-name">${ownerName} <span class="verified">✔</span></div>
                            </div>

                            <div class="price-row">
                                <div class="price-col">
                                    <div class="price-label">판매 USDT</div>
                                    <div class="price-value">${sellNum != null ? ('₩' + sellNum.toLocaleString()) : '—'} <span class="price-currency">KRW</span></div>
                                </div>
                                <div class="price-col">
                                    <div class="price-label">구매 USDT</div>
                                    <div class="price-value">${buyNum != null ? ('₩' + buyNum.toLocaleString()) : '—'} <span class="price-currency">KRW</span></div>
                                </div>
                            </div>

                            <div class="limit-info">주문 한도: ${escapeHtml(orderTxt)}</div>
                            <div class="network-info" style="margin-bottom: 14px;">
                                <span class="dot purple"></span> TON
                                <span class="dot yellow" style="margin-left: 10px;"></span> Boost: ${escapeHtml(boostTxt)}
                            </div>

                            ${offerBtnHtml}
                        </div>
                    `;
                };

                dom.traderList.innerHTML = listings.map(createListingCardHtml).join('');
            } catch (error) {
                if (dom.traderList) {
                    dom.traderList.innerHTML =
                        "<div style='text-align: center; color: #94a3b8; padding: 30px; font-size: 14px;'>" +
                        "목록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</div>";
                }
                console.error('loadMarketplace error:', error);
            } finally {
                try {
                    await updateListingRegisterBtnState();
                } catch (eBtn) {}
            }
        }

        // --------------------------------------------------------
        // Payment: Saved Wallets / Bank Accounts UI + Modals
        // (STORAGE 키는 상단 dom 블록 직후에 정의됨)

        // --------------------------------------------------------
        // Telegram CloudStorage (PC/모바일 간 동기화용)
        // localStorage는 기기별로 따로 저장되지만, CloudStorage는 텔레그램 사용자 기준으로 공유됩니다.
        const cloudStorage = tg && tg.CloudStorage ? tg.CloudStorage : null;

        function cloudSupported() {
            return !!cloudStorage && typeof cloudStorage.getItems === 'function';
        }

        function cloudGetItems(keys) {
            return new Promise((resolve) => {
                if (!cloudSupported()) return resolve({});
                cloudStorage.getItems(keys, (err, res) => {
                    if (err || !res) return resolve({});
                    resolve(res);
                });
            });
        }

        function cloudSetItem(key, value) {
            return new Promise((resolve) => {
                if (!cloudSupported()) return resolve();
                cloudStorage.setItem(key, value, () => resolve());
            });
        }

        function cloudRemoveItems(keys) {
            return new Promise((resolve) => {
                if (!cloudSupported()) return resolve();
                cloudStorage.removeItems(keys, () => resolve());
            });
        }

        async function syncCloudToLocal() {
            if (!cloudSupported()) return;
            const keys = [
                STORAGE.TON_WALLETS,
                STORAGE.DEFAULT_TON_WALLET_ADDRESS,
                STORAGE.LEGACY_DEFAULT_TON_WALLET,
                STORAGE.BANK_ACCOUNTS,
                STORAGE.DEFAULT_BANK_ACCOUNT_ID,
                STORAGE.KYC_TIER2_COMPLETE,
                STORAGE.LISTINGS
            ];

            const values = await cloudGetItems(keys);
            keys.forEach((k) => {
                // CloudStorage에서 없는 키는 빈 문자열로 올 수 있습니다.
                if (typeof values[k] !== 'undefined' && values[k] !== '') {
                    localStorage.setItem(k, values[k]);
                }
            });
        }

        function safeParseJson(value, fallback) {
            try {
                return JSON.parse(value);
            } catch (e) {
                return fallback;
            }
        }

        // --------------------------------------------------------
        // 리스팅 저장소 (로컬/클라우드)
        function loadListings() {
            return safeParseJson(localStorage.getItem(STORAGE.LISTINGS) || '[]', []);
        }

        function saveListings(listings) {
            var next = Array.isArray(listings) ? listings : [];
            try {
                localStorage.setItem(STORAGE.LISTINGS, JSON.stringify(next));
            } catch (e) {}

            // 텔레그램 CloudStorage가 있으면 동기화
            try {
                cloudSetItem(STORAGE.LISTINGS, JSON.stringify(next));
            } catch (e) {}
        }

        /** 예전 데모용 G-DRAGON/SUPERMAN 가상 리스팅을 로컬·클라우드 목록에서 제거 */
        function purgeLegacyVirtualListingsFromStorage() {
            try {
                var list = safeParseJson(localStorage.getItem(STORAGE.LISTINGS) || '[]', []);
                if (!Array.isArray(list) || !list.length) return;
                var next = list.filter(function (l) {
                    var o = String(l && l.ownerId || '');
                    return o !== 'virtual_gdragon' && o !== 'virtual_superman';
                });
                if (next.length === list.length) return;
                saveListings(next);
            } catch (e) {}
        }

        // --------------------------------------------------------
        // 주문 Flow (구매/판매 데모)
        let orderFlowState = {
            listingId: null,
            side: 'buy',
            unitPrice: 0,
            buyUnitPrice: 0,
            sellUnitPrice: 0,
            canBuy: false,
            canSell: false,
            orderMinUsdt: 0,
            orderMaxUsdt: 0,
            listingOwnerId: '',
            listingOwnerName: '',
            listingBankText: '',
            listingBankAccountId: '',
            listingTonWalletAddress: ''
        };
        let myOffersState = { tab: 'active', orders: [] };
        let ordersRealtimeTimer = null;
        let ordersPollingInFlight = false;
        let lastOrdersSnapshotHash = '';
        let sellerAlertedOrderIds = {};
        const ORDER_REALTIME_INTERVAL_MS = 3000;
        const STORAGE_ORDER_SELLER_ALERTED = 'orderSellerAlertedIdsV1';
        const UI_THEME_STORAGE_KEY = 'uiThemeMode';
        const UI_LANG_STORAGE_KEY = 'uiLangMode';
        let finalCompleteConfirmResolver = null;
        let finalCompleteConfirmTimer = null;
        let uiThemeMode = 'dark';
        let uiLangMode = 'ko';
        /** orderSubmittedOverlay 확인 버튼: 'myOffers' 내 주문 이동 */
        let orderSubmittedOverlayAction = 'myOffers';
        /** TonConnect sendTransaction 대기 중 — 이 때 closeModal·포커스 정리하면 전송이 취소될 수 있음 */
        let tonSendTransactionInFlight = false;
        /** 전송하기 클릭 후 Tonkeeper로 나갔다 텔레그램 복귀 시 주문 완료 처리용 */
        let tonOrderSendPending = null;
        /** 텔레그램 복귀 경로에서 이미 patchOrder 했으면 await 이후 중복 저장 방지 */
        let tonOrderSendResolvedByReturn = false;
        /** 복귀 시 tryComplete 디바운스 */
        let tonTelegramReturnCompleteTimer = null;

        const UI_TEXTS = {
            ko: {
                marketplace: '마켓플레이스',
                topTrader: '탑 트레이더',
                listing: '리스팅',
                footerTheme: '테마',
                footerLanguage: '한국어',
                privacy: '개인정보 처리방침',
                privacyLangNote: '',
                terms: '이용약관',
                termsLangNote: '',
                preparing: '준비중입니다.',
                menuMyOffersGroup: '내 주문',
                myOffersActive: '진행중',
                myOffersHistory: '거래 내역',
                myOffersEmptyActive: '진행중인 주문이 없습니다.',
                myOffersEmptyHistory: '거래 내역이 없습니다.'
            },
            en: {
                marketplace: 'Marketplace',
                topTrader: 'Top Traders',
                listing: 'Listing',
                footerTheme: 'Theme',
                footerLanguage: 'EN',
                privacy: 'Privacy Policy',
                privacyLangNote: 'The full text below is provided in Korean.',
                terms: 'Terms of Service',
                termsLangNote: 'The full text below is provided in Korean.',
                preparing: 'Coming soon.',
                menuMyOffersGroup: 'My Orders',
                myOffersActive: 'In Progress',
                myOffersHistory: 'Transaction History',
                myOffersEmptyActive: 'No orders in progress.',
                myOffersEmptyHistory: 'No transaction history.',
            }
        };

        function getUiTexts() {
            return uiLangMode === 'en' ? UI_TEXTS.en : UI_TEXTS.ko;
        }

        function applyThemeMode() {
            var isLight = uiThemeMode === 'light';
            document.body.classList.toggle('theme-light', isLight);
            try { localStorage.setItem(UI_THEME_STORAGE_KEY, uiThemeMode); } catch (e) {}
        }

        function applyLanguageMode() {
            var txt = getUiTexts();
            var el1 = document.getElementById('marketplaceLogoText');
            var el2 = document.getElementById('topTraderTitle');
            var el3 = document.getElementById('listingBtnText');
            var el4 = document.getElementById('footerThemeText');
            var el5 = document.getElementById('footerLanguageText');
            var el6 = document.getElementById('footerPrivacyBtn');
            var el7 = document.getElementById('footerTermsBtn');
            if (el1) el1.textContent = txt.marketplace;
            if (el2) el2.textContent = txt.topTrader;
            if (el3) el3.textContent = txt.listing;
            if (el4) el4.textContent = txt.footerTheme;
            if (el5) el5.textContent = txt.footerLanguage;
            if (el6) el6.textContent = txt.privacy;
            if (el7) el7.textContent = txt.terms;
            var privacyModalTitle = document.getElementById('privacyPolicyModalTitle');
            if (privacyModalTitle) privacyModalTitle.textContent = txt.privacy;
            var privacyNote = document.getElementById('privacyLangNote');
            if (privacyNote) {
                privacyNote.textContent = txt.privacyLangNote || '';
                privacyNote.classList.toggle('hidden', uiLangMode !== 'en');
            }
            var termsModalTitle = document.getElementById('termsOfServiceModalTitle');
            if (termsModalTitle) termsModalTitle.textContent = txt.terms;
            var termsNote = document.getElementById('termsLangNote');
            if (termsNote) {
                termsNote.textContent = txt.termsLangNote || '';
                termsNote.classList.toggle('hidden', uiLangMode !== 'en');
            }
            var menuMp = document.getElementById('menuNavMarketplaceText');
            if (menuMp) menuMp.textContent = txt.marketplace;
            var menuGroup = document.getElementById('menuNavMyOffersGroup');
            if (menuGroup) menuGroup.textContent = txt.menuMyOffersGroup;
            var menuAct = document.getElementById('menuNavOffersActive');
            if (menuAct) menuAct.textContent = txt.myOffersActive;
            var menuHist = document.getElementById('menuNavOffersHistory');
            if (menuHist) menuHist.textContent = txt.myOffersHistory;
            var offTitle = document.getElementById('myOffersScreenTitle');
            if (offTitle) offTitle.textContent = '📄 ' + txt.menuMyOffersGroup;
            var tabA = document.getElementById('myOffersTabActiveText');
            if (tabA) tabA.textContent = txt.myOffersActive;
            var tabH = document.getElementById('myOffersTabHistoryText');
            if (tabH) tabH.textContent = txt.myOffersHistory;
            try { localStorage.setItem(UI_LANG_STORAGE_KEY, uiLangMode); } catch (e) {}
            if (typeof isMyOffersViewVisible === 'function' && isMyOffersViewVisible()) {
                try { renderMyOffers(); } catch (eR) {}
            }
        }

        function showPreparingNotice() {
            var msg = getUiTexts().preparing;
            if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
            else alert(msg);
        }

        /** 개인정보 처리방침 iframe 테마 동기화 (?theme=light|dark) */
        function refreshPrivacyPolicyIframeTheme() {
            var iframe = document.getElementById('privacyPolicyIframe');
            if (!iframe) return;
            var light = document.body.classList.contains('theme-light');
            iframe.src = 'privacy-policy.html?theme=' + (light ? 'light' : 'dark');
        }

        function showPrivacyPolicy() {
            var overlay = document.getElementById('privacyPolicyOverlay');
            if (!overlay) return;
            refreshPrivacyPolicyIframeTheme();
            overlay.classList.remove('hidden');
            var txt = getUiTexts();
            var title = document.getElementById('privacyPolicyModalTitle');
            if (title) title.textContent = txt.privacy;
            var note = document.getElementById('privacyLangNote');
            if (note) {
                note.textContent = txt.privacyLangNote || '';
                note.classList.toggle('hidden', uiLangMode !== 'en');
            }
        }

        function closePrivacyPolicy() {
            var overlay = document.getElementById('privacyPolicyOverlay');
            if (overlay) overlay.classList.add('hidden');
        }

        function closePrivacyPolicyIfOverlay(event) {
            if (!event || event.target !== event.currentTarget) return;
            closePrivacyPolicy();
        }

        /** 서비스 이용약관 iframe 테마 동기화 */
        function refreshTermsIframeTheme() {
            var iframe = document.getElementById('termsOfServiceIframe');
            if (!iframe) return;
            var light = document.body.classList.contains('theme-light');
            iframe.src = 'terms-of-service.html?theme=' + (light ? 'light' : 'dark');
        }

        function showTermsOfService() {
            var overlay = document.getElementById('termsOfServiceOverlay');
            if (!overlay) return;
            refreshTermsIframeTheme();
            overlay.classList.remove('hidden');
            var txt = getUiTexts();
            var title = document.getElementById('termsOfServiceModalTitle');
            if (title) title.textContent = txt.terms;
            var note = document.getElementById('termsLangNote');
            if (note) {
                note.textContent = txt.termsLangNote || '';
                note.classList.toggle('hidden', uiLangMode !== 'en');
            }
        }

        function closeTermsOfService() {
            var overlay = document.getElementById('termsOfServiceOverlay');
            if (overlay) overlay.classList.add('hidden');
        }

        function closeTermsOfServiceIfOverlay(event) {
            if (!event || event.target !== event.currentTarget) return;
            closeTermsOfService();
        }

        function toggleThemeMode() {
            uiThemeMode = uiThemeMode === 'light' ? 'dark' : 'light';
            applyThemeMode();
            var overlayP = document.getElementById('privacyPolicyOverlay');
            if (overlayP && !overlayP.classList.contains('hidden')) {
                refreshPrivacyPolicyIframeTheme();
            }
            var overlayT = document.getElementById('termsOfServiceOverlay');
            if (overlayT && !overlayT.classList.contains('hidden')) {
                refreshTermsIframeTheme();
            }
        }

        function toggleLanguageMode() {
            uiLangMode = uiLangMode === 'en' ? 'ko' : 'en';
            applyLanguageMode();
        }

        function clearFinalCompleteConfirmTimer() {
            if (finalCompleteConfirmTimer) {
                clearInterval(finalCompleteConfirmTimer);
                finalCompleteConfirmTimer = null;
            }
        }

        function closeFinalCompleteConfirm(result) {
            clearFinalCompleteConfirmTimer();
            if (dom.finalCompleteConfirmOverlay) dom.finalCompleteConfirmOverlay.classList.add('hidden');
            var resolver = finalCompleteConfirmResolver;
            finalCompleteConfirmResolver = null;
            if (resolver) resolver(!!result);
        }

        function closeFinalCompleteConfirmByOverlay(event) {
            if (!event || event.target !== event.currentTarget) return;
            closeFinalCompleteConfirm(false);
        }

        function openFinalCompleteConfirmPopup() {
            if (!dom.finalCompleteConfirmOverlay || !dom.finalCompleteConfirmBtn) return Promise.resolve(true);
            if (finalCompleteConfirmResolver) closeFinalCompleteConfirm(false);
            return new Promise(function (resolve) {
                finalCompleteConfirmResolver = resolve;
                var btn = dom.finalCompleteConfirmBtn;
                var left = 3;
                btn.disabled = true;
                btn.textContent = '거래 완료 (' + String(left) + ')';
                dom.finalCompleteConfirmOverlay.classList.remove('hidden');
                clearFinalCompleteConfirmTimer();
                finalCompleteConfirmTimer = setInterval(function () {
                    left -= 1;
                    if (left > 0) {
                        btn.textContent = '거래 완료 (' + String(left) + ')';
                        return;
                    }
                    clearFinalCompleteConfirmTimer();
                    btn.disabled = false;
                    btn.textContent = '거래 완료';
                }, 1000);
            });
        }

        /** 주문의 side(buy/sell) — DB 컬럼 side 기준 */
        function getOrderSide(order) {
            if (order && order.side) return String(order.side);
            return 'buy';
        }

        function orderStatusLabel(status) {
            var s = String(status || 'pending_seller');
            if (s === 'pending_seller') return '판매자 승인 대기';
            if (s === 'seller_approved') return '입금 대기';
            if (s === 'seller_rejected') return '판매자 거절';
            if (s === 'buyer_paid') return '판매자 전송 대기';
            if (s === 'seller_deposit_checked') return '입금 확인 완료';
            if (s === 'seller_payment_check_requested') return '입금 확인 요청';
            if (s === 'seller_sent') return '구매자 확인 대기';
            if (s === 'buyer_confirmed') return '거래 완료';
            if (s === 'buyer_issue') return '확인 요청';
            if (s === 'buyer_cancelled') return '구매자 취소';
            // 판매(USDT 매도) 플로우
            if (s === 'pending_buyer') return '구매자 승인 대기';
            if (s === 'buyer_rejected_sell') return '구매자 거절';
            if (s === 'buyer_approved_sell') return 'USDT 전송 대기';
            if (s === 'seller_cancelled_sell') return '판매자 취소';
            if (s === 'sell_coin_sent') return '구매자 입금 대기';
            if (s === 'sell_buyer_issue_coin') return 'USDT 전송 확인 요청';
            if (s === 'sell_buyer_pending_coin_ack') return '구매자 USDT 수령 확인 대기';
            if (s === 'sell_fiat_paid') return '판매자 확인·완료 대기';
            if (s === 'sell_seller_issue_fiat') return '입금 재확인 요청';
            return s;
        }

        function orderStatusTone(status) {
            var s = String(status || '');
            if (s === 'buyer_confirmed') return 'done';
            if (s === 'seller_rejected' || s === 'buyer_cancelled') return 'reject';
            if (s === 'buyer_rejected_sell' || s === 'seller_cancelled_sell') return 'reject';
            return 'active';
        }

        /**
         * 구매/판매 전 단계에서 카드별 상황 안내(진행 안내) — 역할·상태별로 통일 표시
         */
        function getOfferProgressHintText(status, orderSide, youAreBuyer) {
            var s = String(status || '');
            if (orderSide === 'sell') {
                if (s === 'pending_buyer') {
                    return youAreBuyer
                        ? '판매 신청을 검토한 뒤 승인 또는 거절해 주세요.'
                        : '상대방(구매자)의 승인을 기다리는 중입니다.';
                }
                if (s === 'buyer_rejected_sell') return '구매자가 판매 신청을 거절했습니다.';
                if (s === 'buyer_approved_sell') {
                    return youAreBuyer
                        ? '판매자의 USDT 전송을 기다리는 중입니다.'
                        : '안내된 구매자 지갑으로 USDT를 송금한 뒤 전송하기를 눌러 주세요.';
                }
                if (s === 'seller_cancelled_sell') return '판매자가 이 거래를 취소했습니다.';
                if (s === 'sell_coin_sent') {
                    return youAreBuyer
                        ? '판매자 계좌로 원화를 입금한 뒤 입금 완료를 눌러 주세요.'
                        : '구매자의 원화 입금을 기다리는 중입니다.';
                }
                if (s === 'sell_buyer_issue_coin') {
                    return youAreBuyer
                        ? '판매자에게 USDT 전송 확인을 요청했습니다. 판매자 처리를 기다려 주세요.'
                        : '구매자의 확인 요청을 검토한 뒤 전송 상태를 반영해 주세요.';
                }
                if (s === 'sell_buyer_pending_coin_ack') {
                    return youAreBuyer
                        ? '판매자 답변을 확인한 뒤, 온체인 USDT 수령 여부를 확인하고 「USDT 수령 확인」을 눌러 주세요.'
                        : '구매자가 USDT 수령 여부를 확인할 때까지 대기 중입니다. 필요 시 답장을 보내거나 재전송할 수 있습니다.';
                }
                if (s === 'sell_fiat_paid') {
                    return youAreBuyer
                        ? '판매자의 최종 확인·거래 완료를 기다리는 중입니다.'
                        : '구매자가 원화 입금을 완료했습니다. 입금 확인 후 거래 완료를 눌러 주세요.';
                }
                if (s === 'sell_seller_issue_fiat') {
                    return youAreBuyer
                        ? '판매자가 원화 입금 재확인을 요청했습니다. 필요 시 입금 완료(재확인)를 눌러 주세요.'
                        : '구매자에게 입금 재확인을 요청했습니다. 구매자 응답을 기다려 주세요.';
                }
                if (s === 'buyer_confirmed') return '거래가 정상 완료되었습니다.';
                return orderStatusLabel(s);
            }
            if (s === 'pending_seller') {
                return youAreBuyer
                    ? '판매자 승인을 기다리는 중입니다.'
                    : '요청을 검토한 뒤 승인 또는 거절해 주세요.';
            }
            if (s === 'seller_rejected') return '판매자가 요청을 거절했습니다.';
            if (s === 'seller_approved') {
                return youAreBuyer
                    ? '표시된 계좌로 원화 입금 후 입금 완료를 눌러 주세요.'
                    : '구매자 입금을 기다리는 중입니다. 입금 확인 후 다음 단계를 진행해 주세요.';
            }
            if (s === 'buyer_cancelled') return '구매자가 거래를 취소했습니다.';
            if (s === 'buyer_paid') {
                return youAreBuyer
                    ? '판매자의 USDT 전송을 기다리는 중입니다.'
                    : '구매자 지갑으로 USDT를 보낸 뒤 전송하기를 눌러 주세요.';
            }
            if (s === 'seller_deposit_checked') {
                return youAreBuyer
                    ? '판매자가 입금을 확인했습니다. 다음 안내에 따라 진행해 주세요.'
                    : '입금 확인이 완료되었습니다. USDT를 전송해 주세요.';
            }
            if (s === 'seller_payment_check_requested') {
                return youAreBuyer
                    ? '판매자가 입금 확인을 요청했습니다. 입금 상태를 다시 확인해 주세요.'
                    : '구매자의 입금 완료 알림을 기다리는 중입니다.';
            }
            if (s === 'buyer_issue') {
                return youAreBuyer
                    ? '판매자에게 확인 요청을 보냈습니다. 답변을 기다려 주세요.'
                    : '구매자의 확인 요청을 검토한 뒤 전송을 완료해 주세요.';
            }
            if (s === 'seller_sent') {
                return youAreBuyer
                    ? 'USDT 수령을 확인한 뒤 거래 완료 또는 확인 요청을 선택해 주세요.'
                    : '구매자의 최종 확인을 기다리는 중입니다.';
            }
            if (s === 'buyer_confirmed') return '거래가 정상 완료되었습니다.';
            return orderStatusLabel(s);
        }

        function escapeHtml(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function escapeJsSingleQuote(s) {
            return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        }

        function parseBankTextParts(text) {
            var raw = String(text || '');
            var parts = raw.split(' | ');
            if (parts.length >= 3) {
                return {
                    bankName: parts[0] || '',
                    accountNumber: parts[1] || '',
                    accountHolder: parts.slice(2).join(' | ') || ''
                };
            }
            // 구 포맷 fallback: 값 하나만 오면 은행명으로만 처리
            return {
                bankName: raw || '',
                accountNumber: '',
                accountHolder: ''
            };
        }

        async function copyOfferValue(value, label) {
            var v = String(value || '').trim();
            if (!v) return;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(v);
                } else {
                    var ta = document.createElement('textarea');
                    ta.value = v;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                var msg = (label || '값') + '이(가) 복사되었습니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                else alert(msg);
            } catch (e) {
                var err = (label || '값') + ' 복사에 실패했습니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(err);
                else alert(err);
            }
        }

        /** 영수증 모달용 타임스탬프 표시 */
        function formatReceiptTimestamp(ms) {
            var n = Number(ms || 0);
            if (!n) return '—';
            try {
                return new Date(n).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
            } catch (e) {
                return '—';
            }
        }

        /** 거래 영수증 한 줄(라벨·값 모두 이스케이프) */
        function receiptRowPlain(label, valueText) {
            var v = String(valueText == null ? '' : valueText);
            return (
                '<div class="receipt-row"><span class="receipt-k">' +
                escapeHtml(label) +
                '</span><span class="receipt-v">' +
                escapeHtml(v) +
                '</span></div>'
            );
        }

        /** 거래 내역 카드에서 열리는 상세 영수증 HTML 생성 */
        function buildTransactionReceiptInnerHtml(order) {
            var o = order || {};
            var r = o.receiver && typeof o.receiver === 'object' ? o.receiver : {};
            var side = getOrderSide(o);
            var status = String(r.status || '');
            var usdt = Number(o.usdt || 0);
            var krw = Number(o.krw || 0);
            var price = usdt > 0 ? krw / usdt : 0;
            var orderId = String(o.id || '—');
            var listingId = String(o.listing_id != null ? o.listing_id : o.listingId != null ? o.listingId : '—');
            var createdAt = formatReceiptTimestamp(o.created_at != null ? o.created_at : o.createdAt);

            var buyerName = String(r.buyerName || '구매자');
            var sellerName = String(r.sellerName || '판매자');
            var buyerId = String(r.buyerId || '—');
            var sellerId = String(r.sellerId || '—');

            var typeLabel = side === 'sell' ? 'USDT 판매' : 'USDT 구매';
            var flowText =
                side === 'sell'
                    ? '리스팅 소유자(구매자)가 원화를 입금하고, 판매자가 USDT를 전송하는 흐름입니다.'
                    : '구매자가 원화를 입금하고, 판매자가 USDT를 전송하는 흐름입니다.';

            var bank = {
                bankName: String(r.sellerBankName || ''),
                accountNumber: String(r.sellerBankAccountNumber || ''),
                accountHolder: String(r.sellerBankAccountHolder || '')
            };
            if (!bank.bankName && !bank.accountNumber && !bank.accountHolder) {
                bank = parseBankTextParts(String(r.sellerBankText || ''));
            }

            var html = '';
            html +=
                '<div class="receipt-section receipt-section--accent">' +
                '<div class="receipt-title">' +
                escapeHtml(orderStatusLabel(status)) +
                '</div>' +
                '<div class="receipt-sub">' +
                escapeHtml(typeLabel + ' · 주문 #' + orderId) +
                '</div></div>';

            html += '<div class="receipt-sep"></div>';
            html += '<div class="receipt-section-title">참여자</div>';
            html += receiptRowPlain('구매자', buyerName + ' (ID: ' + buyerId + ')');
            html += receiptRowPlain('판매자', sellerName + ' (ID: ' + sellerId + ')');

            html += '<div class="receipt-sep"></div>';
            html += '<div class="receipt-section-title">거래 금액</div>';
            html += receiptRowPlain('USDT', (Number.isFinite(usdt) ? usdt : 0).toLocaleString() + ' USDT');
            html += receiptRowPlain('원화', Math.floor(Number.isFinite(krw) ? krw : 0).toLocaleString() + ' KRW');
            html += receiptRowPlain('적용 단가', Math.floor(Number.isFinite(price) ? price : 0).toLocaleString() + ' KRW/USDT');

            html += '<div class="receipt-sep"></div>';
            html += '<div class="receipt-section-title">거래 방식</div>';
            html += receiptRowPlain('유형', typeLabel);
            html += receiptRowPlain('설명', flowText);
            html += receiptRowPlain('네트워크', 'TON (테스트넷 USDT)');

            var dep = String(r.depositName || '').trim();
            if (dep) {
                html += receiptRowPlain('입금자명(구매)', dep);
            }

            var hasBank = !!(bank.bankName || bank.accountNumber || bank.accountHolder);
            if (hasBank) {
                html += '<div class="receipt-sep"></div>';
                html += '<div class="receipt-section-title">정산 계좌 (판매자 안내)</div>';
                html += receiptRowPlain('은행', bank.bankName || '—');
                html += receiptRowPlain('계좌번호', bank.accountNumber || '—');
                html += receiptRowPlain('예금주', bank.accountHolder || '—');
            }

            var wBuy = String(r.receiverWalletAddress || '').trim();
            var wSellRecv = String(r.buyerReceiverWalletAddress || '').trim();
            if (wBuy || wSellRecv) {
                html += '<div class="receipt-sep"></div>';
                html += '<div class="receipt-section-title">지갑 주소</div>';
                if (wBuy) {
                    html +=
                        '<div class="receipt-row"><span class="receipt-k">' +
                        escapeHtml('구매자 수취 지갑') +
                        '</span><span class="receipt-v receipt-v--break">' +
                        escapeHtml(wBuy) +
                        '</span></div>';
                }
                if (wSellRecv) {
                    html +=
                        '<div class="receipt-row"><span class="receipt-k">' +
                        escapeHtml('판매 건 구매자 USDT 지갑') +
                        '</span><span class="receipt-v receipt-v--break">' +
                        escapeHtml(wSellRecv) +
                        '</span></div>';
                }
            }

            var tx = String(r.txid || '').trim();
            if (tx) {
                html += '<div class="receipt-sep"></div>';
                html += '<div class="receipt-section-title">온체인</div>';
                html +=
                    '<div class="receipt-row"><span class="receipt-k">' +
                    escapeHtml('TxID / BOC') +
                    '</span><span class="receipt-v receipt-v--break">' +
                    escapeHtml(tx) +
                    '</span></div>';
            }

            if (String(r.issueNote || '').trim()) {
                html += receiptRowPlain('진행 중 확인 요청', String(r.issueNote || ''));
            }
            if (String(r.sellerCoinIssueReply || '').trim()) {
                html += receiptRowPlain('판매자 답변(USDT)', String(r.sellerCoinIssueReply || ''));
            }

            html += '<div class="receipt-sep"></div>';
            html += '<div class="receipt-section-title">기록</div>';
            html += receiptRowPlain('주문 생성 시각', createdAt);
            html += receiptRowPlain('리스팅 ID', listingId);
            if (r.sellerApprovedAt) {
                html += receiptRowPlain('판매자 승인', formatReceiptTimestamp(r.sellerApprovedAt));
            }
            if (r.buyerPaidAt) {
                html += receiptRowPlain('구매자 입금 알림', formatReceiptTimestamp(r.buyerPaidAt));
            }
            if (r.sellerSentAt) {
                html += receiptRowPlain('USDT 전송 시각', formatReceiptTimestamp(r.sellerSentAt));
            }

            html += '<div class="receipt-sep"></div>';
            html += '<div class="receipt-section-title">종료 정보</div>';
            if (status === 'buyer_confirmed') {
                html += receiptRowPlain('결과', '거래 완료');
                html += receiptRowPlain('완료 시각', formatReceiptTimestamp(r.buyerConfirmedAt));
            } else if (status === 'seller_rejected') {
                html += receiptRowPlain('결과', '판매자 거절');
                html += receiptRowPlain('거절 사유', String(r.rejectReason || '').trim() || '(사유 미입력 · 과거 주문)');
            } else if (status === 'buyer_rejected_sell') {
                html += receiptRowPlain('결과', '구매자(리스팅 주인) 거절');
                html += receiptRowPlain('거절 사유', String(r.rejectReason || '').trim() || '(사유 미입력 · 과거 주문)');
            } else if (status === 'buyer_cancelled') {
                html += receiptRowPlain('결과', '구매자 취소');
                html += receiptRowPlain('취소 주체', '구매자');
                html += receiptRowPlain('취소 메모', String(r.cancelNote || '').trim() || '(메모 없음 · 과거 주문)');
            } else if (status === 'seller_cancelled_sell') {
                html += receiptRowPlain('결과', '판매자 취소');
                html += receiptRowPlain('취소 주체', '판매자');
                html += receiptRowPlain('취소 메모', String(r.cancelNote || '').trim() || '(메모 없음 · 과거 주문)');
            } else {
                html += receiptRowPlain('결과', orderStatusLabel(status));
            }

            return html;
        }

        /** 영수증 모달 열릴 때 뒤 목록이 스크롤되지 않도록 body 고정(iOS 텔레그램 WebView 대응) */
        var _receiptBodyScrollY = 0;

        function lockScrollForTransactionReceipt() {
            _receiptBodyScrollY = window.scrollY || window.pageYOffset || 0;
            try {
                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';
                document.body.style.position = 'fixed';
                document.body.style.top = '-' + _receiptBodyScrollY + 'px';
                document.body.style.left = '0';
                document.body.style.right = '0';
                document.body.style.width = '100%';
            } catch (e) {}
        }

        function unlockScrollForTransactionReceipt() {
            try {
                document.documentElement.style.overflow = '';
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.left = '';
                document.body.style.right = '';
                document.body.style.width = '';
            } catch (e) {}
            try {
                window.scrollTo(0, _receiptBodyScrollY);
            } catch (e2) {}
        }

        function closeTransactionReceiptDetail() {
            var el = document.getElementById('transactionReceiptOverlay');
            if (el) el.classList.add('hidden');
            unlockScrollForTransactionReceipt();
        }

        function openTransactionReceiptDetail(orderId) {
            var id = String(orderId || '');
            var orders = Array.isArray(myOffersState.orders) ? myOffersState.orders : [];
            var o = orders.find(function (x) {
                return String(x && x.id) === id;
            });
            if (!o) return;
            var body = document.getElementById('transactionReceiptBody');
            var overlay = document.getElementById('transactionReceiptOverlay');
            if (!body || !overlay) return;
            body.innerHTML = buildTransactionReceiptInnerHtml(o);
            // 이전에 맨 아래까지 스크롤한 뒤 닫았어도, 새 영수증은 항상 맨 위부터 보이게 함
            body.scrollTop = 0;
            try {
                body.scrollTo(0, 0);
            } catch (eScroll) {}
            overlay.classList.remove('hidden');
            lockScrollForTransactionReceipt();
            requestAnimationFrame(function () {
                try {
                    body.scrollTop = 0;
                    body.scrollTo(0, 0);
                } catch (eRaf) {}
            });
        }

        /** 거래 내역 카드 클릭: 복사 링크 클릭은 제외 */
        function onHistoryOfferCardClick(ev, orderId) {
            if (ev && ev.target && typeof ev.target.closest === 'function') {
                if (ev.target.closest('.offer-copy-link')) return;
                if (ev.target.closest('button')) return;
            }
            openTransactionReceiptDetail(orderId);
        }

        function loadSellerAlertedOrderIds() {
            try {
                var raw = localStorage.getItem(STORAGE_ORDER_SELLER_ALERTED);
                var obj = raw ? JSON.parse(raw) : {};
                sellerAlertedOrderIds = (obj && typeof obj === 'object') ? obj : {};
            } catch (e) {
                sellerAlertedOrderIds = {};
            }
        }

        function saveSellerAlertedOrderIds() {
            try {
                localStorage.setItem(STORAGE_ORDER_SELLER_ALERTED, JSON.stringify(sellerAlertedOrderIds || {}));
            } catch (e) {}
        }

        function computeOrdersSnapshotHash(rows) {
            if (!Array.isArray(rows)) return '';
            // 주문 목록의 핵심 상태만 해시로 만들어 변경 감지에 사용
            return rows.map(function (o) {
                var r = o && o.receiver && typeof o.receiver === 'object' ? o.receiver : {};
                return [
                    String(o.id || ''),
                    String(r.status || ''),
                    String(r.updatedAt || ''),
                    String(r.buyerId || ''),
                    String(r.sellerId || ''),
                    String(r.rejectReason || ''),
                    String(r.cancelNote || '')
                ].join(':');
            }).join('|');
        }

        function updateMyOffersCountBadge(rows) {
            var badge = document.getElementById('myOffersCountBadge');
            if (!badge) return;
            var userId = String(currentUserId || '');
            if (!userId) {
                badge.classList.add('hidden');
                return;
            }
            var count = (Array.isArray(rows) ? rows : []).filter(function (o) {
                var r = o && o.receiver && typeof o.receiver === 'object' ? o.receiver : {};
                var involved = String(r.buyerId || '') === userId || String(r.sellerId || '') === userId;
                if (!involved) return false;
                var st = String(r.status || '');
                // 미완료 건만 카운트(완료/거절/취소 제외)
                var done = st === 'buyer_confirmed' || st === 'seller_rejected' || st === 'buyer_cancelled'
                    || st === 'buyer_rejected_sell' || st === 'seller_cancelled_sell';
                return !done;
            }).length;
            if (count <= 0) {
                badge.classList.add('hidden');
                badge.textContent = '0';
                return;
            }
            badge.classList.remove('hidden');
            badge.textContent = count > 99 ? '99+' : String(count);
        }

        /** 구매: pending_seller → 판매자 알림 / 판매: pending_buyer → 구매자(리스팅 주인) 알림 */
        function notifySellerForNewPendingOrders(rows) {
            var userId = String(currentUserId || '');
            if (!userId || !Array.isArray(rows)) return;
            var newBuyCount = 0;
            var newSellCount = 0;
            rows.forEach(function (o) {
                var id = String(o && o.id ? o.id : '');
                var r = o && o.receiver && typeof o.receiver === 'object' ? o.receiver : {};
                if (!id || sellerAlertedOrderIds[id]) return;
                var side = getOrderSide(o);
                var st = String(r.status || '');
                if (side === 'sell' && st === 'pending_buyer' && String(r.buyerId || '') === userId) {
                    sellerAlertedOrderIds[id] = 1;
                    newSellCount += 1;
                } else if (side !== 'sell' && st === 'pending_seller' && String(r.sellerId || '') === userId) {
                    sellerAlertedOrderIds[id] = 1;
                    newBuyCount += 1;
                }
            });
            if (newBuyCount > 0 || newSellCount > 0) {
                saveSellerAlertedOrderIds();
                // 구매/판매 알림을 한 번에 표시하고, 확인 시 내 주문(진행중)으로 이동
                var parts = [];
                if (newBuyCount > 0) {
                    parts.push(newBuyCount === 1
                        ? '새 구매 요청 1건이 도착했습니다.'
                        : ('새 구매 요청 ' + newBuyCount + '건이 도착했습니다.'));
                }
                if (newSellCount > 0) {
                    parts.push(newSellCount === 1
                        ? '새 판매 요청 1건이 도착했습니다.'
                        : ('새 판매 요청 ' + newSellCount + '건이 도착했습니다.'));
                }
                var popupVariant = 'neutral';
                if (newBuyCount > 0 && newSellCount > 0) popupVariant = 'both';
                else if (newBuyCount > 0) popupVariant = 'buy';
                else if (newSellCount > 0) popupVariant = 'sell';
                showOrderSubmittedPopupNavigatingToMyOffers(parts.join('\n'), { variant: popupVariant });
            }
        }

        function isMyOffersViewVisible() {
            var el = document.getElementById('myOffersView');
            return !!(el && !el.classList.contains('hidden'));
        }

        async function pollOrdersRealtime() {
            if (ordersPollingInFlight) return;
            if (document && document.visibilityState === 'hidden') return;
            ordersPollingInFlight = true;
            try {
                var rows = await fetchOrdersFromSupabase();
                var nextHash = computeOrdersSnapshotHash(rows);
                updateMyOffersCountBadge(rows);
                notifySellerForNewPendingOrders(rows);
                myOffersState.orders = rows;
                if (nextHash !== lastOrdersSnapshotHash) {
                    lastOrdersSnapshotHash = nextHash;
                    if (isMyOffersViewVisible()) renderMyOffers();
                } else if (isMyOffersViewVisible()) {
                    // 같은 스냅샷이라도 화면 진입 직후 비어 보이는 경우를 방지
                    renderMyOffers();
                }
            } catch (e) {
                // 실시간 폴링은 조용히 실패 처리(경고 스팸 방지)
            } finally {
                ordersPollingInFlight = false;
            }
        }

        function startOrdersRealtimeSync() {
            if (ordersRealtimeTimer) return;
            ordersRealtimeTimer = setInterval(function () {
                pollOrdersRealtime();
            }, ORDER_REALTIME_INTERVAL_MS);
            // 시작 즉시 1회 실행
            pollOrdersRealtime();
        }

        function formatOrderWalletAddress(address) {
            var s = String(address || '');
            if (s.length <= 12) return s;
            // 주문 화면 가독성용: 앞 6자리 + ..... + 뒤 6자리
            return s.slice(0, 6) + '.....' + s.slice(-6);
        }

        function parseOrderNumber(value) {
            var raw = String(value == null ? '' : value).replace(/,/g, '').trim();
            if (!raw) return 0;
            var n = Number(raw);
            return Number.isFinite(n) ? n : 0;
        }

        function parseListingNumber(value) {
            var raw = String(value == null ? '' : value).replace(/,/g, '').trim();
            if (!raw) return NaN;
            var n = Number(raw);
            return Number.isFinite(n) ? n : NaN;
        }

        function formatListingNumber(value) {
            var n = Number(value || 0);
            if (!Number.isFinite(n)) return '';
            return Math.floor(n).toLocaleString();
        }

        function formatOrderNumber(value, digits) {
            var n = Number(value || 0);
            if (!Number.isFinite(n) || n <= 0) return '';
            var maxDigits = typeof digits === 'number' ? digits : 0;
            return n.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: maxDigits
            });
        }

        function closeOrderFlow() {
            if (dom.orderFlowView) dom.orderFlowView.classList.add('hidden');
            if (dom.marketplaceView) dom.marketplaceView.classList.remove('hidden');
        }

        function updateOrderSubmitButton() {
            if (!dom.orderSubmitBtn) return;
            var usdt = parseOrderNumber(dom.orderUsdtInput ? dom.orderUsdtInput.value : 0);
            var krw = parseOrderNumber(dom.orderKrwInput ? dom.orderKrwInput.value : 0);
            // 수취 정보(구매: 수취지갑/입금자명, 판매: 수취계좌/지갑주소)가 비어있으면 주문 불가
            var receiverOk = true;
            if (orderFlowState.side === 'buy') {
                var recvWallet = dom.orderBuyReceiveWalletInput ? dom.orderBuyReceiveWalletInput.value : '';
                var depositName = dom.orderBuyDepositNameInput ? dom.orderBuyDepositNameInput.value : '';
                receiverOk = String(recvWallet || '').trim().length > 0 && String(depositName || '').trim().length > 0;
            } else {
                var recvAccount = dom.orderSellReceiveAccountInput ? dom.orderSellReceiveAccountInput.value : '';
                var recvAddr = dom.orderSellWalletAddressInput ? dom.orderSellWalletAddressInput.value : '';
                receiverOk = String(recvAccount || '').trim().length > 0 && String(recvAddr || '').trim().length > 0;
            }

            var canSubmit = receiverOk && Number.isFinite(usdt) && usdt > 0 && Number.isFinite(krw) && krw > 0;
            dom.orderSubmitBtn.disabled = !canSubmit;
            dom.orderSubmitBtn.classList.toggle('enabled', canSubmit);
        }

        function onOrderUsdtInput() {
            var usdt = parseOrderNumber(dom.orderUsdtInput ? dom.orderUsdtInput.value : 0);
            if (!Number.isFinite(usdt) || usdt < 0) usdt = 0;
            var price = Number(orderFlowState.unitPrice || 0);
            var krw = usdt * price;
            if (dom.orderUsdtInput) dom.orderUsdtInput.value = formatOrderNumber(usdt, 3);
            if (dom.orderKrwInput) dom.orderKrwInput.value = formatOrderNumber(Math.floor(krw), 0);
            updateOrderSubmitButton();
        }

        function onOrderKrwInput() {
            var krw = parseOrderNumber(dom.orderKrwInput ? dom.orderKrwInput.value : 0);
            if (!Number.isFinite(krw) || krw < 0) krw = 0;
            var price = Number(orderFlowState.unitPrice || 0);
            var usdt = price > 0 ? (krw / price) : 0;
            var normalizedUsdt = Math.floor(usdt * 1000) / 1000;
            if (dom.orderKrwInput) dom.orderKrwInput.value = formatOrderNumber(Math.floor(krw), 0);
            if (dom.orderUsdtInput) dom.orderUsdtInput.value = formatOrderNumber(normalizedUsdt, 3);
            updateOrderSubmitButton();
        }

        function switchOrderSide(side) {
            orderFlowState.side = side === 'sell' ? 'sell' : 'buy';
            orderFlowState.unitPrice = orderFlowState.side === 'buy'
                ? Number(orderFlowState.buyUnitPrice || 0)
                : Number(orderFlowState.sellUnitPrice || 0);
            if (dom.orderBuyTabBtn) dom.orderBuyTabBtn.classList.toggle('active', orderFlowState.side === 'buy');
            if (dom.orderSellTabBtn) dom.orderSellTabBtn.classList.toggle('active', orderFlowState.side === 'sell');
            if (dom.orderUsdtLabel) dom.orderUsdtLabel.textContent = orderFlowState.side === 'buy' ? '구매할 USDT' : '판매할 USDT';
            if (dom.orderKrwLabel) dom.orderKrwLabel.textContent = orderFlowState.side === 'buy' ? '송금액' : '수령액';
            if (dom.orderBuyWalletCard) dom.orderBuyWalletCard.style.display = orderFlowState.side === 'buy' ? 'block' : 'none';
            if (dom.orderBuyNetworkCard) dom.orderBuyNetworkCard.style.display = orderFlowState.side === 'buy' ? 'block' : 'none';
            if (dom.orderBuyNameCard) dom.orderBuyNameCard.style.display = orderFlowState.side === 'buy' ? 'block' : 'none';
            if (dom.orderSellAccountCard) dom.orderSellAccountCard.style.display = orderFlowState.side === 'sell' ? 'block' : 'none';
            if (dom.orderSellWalletCard) dom.orderSellWalletCard.style.display = orderFlowState.side === 'sell' ? 'block' : 'none';
            if (dom.orderSellNetworkCard) dom.orderSellNetworkCard.style.display = orderFlowState.side === 'sell' ? 'block' : 'none';
            onOrderUsdtInput();
        }

        async function openOrderFlow(listingId, initialSide) {
            var listings = loadListings();
            var found = (Array.isArray(listings) ? listings : []).find(function (l) {
                return String(l.id) === String(listingId);
            });

            // 로컬가 stale일 수 있으므로 주문 진입 시 서버 최신 모드/가격을 우선 반영
            try {
                var serverFound = await fetchListingByIdFromSupabase(listingId);
                if (serverFound) {
                    found = serverFound;
                    // 해당 리스팅 1건만 로컬 목록에 병합하여 화면/주문 기준을 맞춤
                    var merged = Array.isArray(listings) ? listings.slice() : [];
                    var idx = merged.findIndex(function (l) { return String(l && l.id) === String(serverFound.id); });
                    if (idx >= 0) merged[idx] = serverFound;
                    else merged.unshift(serverFound);
                    saveListings(merged);
                }
            } catch (eFetchOne) {}

            // 그래도 못 찾으면 전체 목록으로 한 번 더 확인
            if (!found) {
                try {
                    var serverListings = await fetchListingsFromSupabase();
                    found = (Array.isArray(serverListings) ? serverListings : []).find(function (l) {
                        return String(l.id) === String(listingId);
                    });
                    if (found && Array.isArray(serverListings) && serverListings.length) {
                        saveListings(serverListings);
                    }
                } catch (e) {}
            }
            if (!found) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('존재하지 않는 리스팅입니다.');
                else alert('존재하지 않는 리스팅입니다.');
                return;
            }

            orderFlowState.listingId = found.id;
            orderFlowState.orderMinUsdt = Number(found.orderMinUsdt || 0);
            orderFlowState.orderMaxUsdt = Number(found.orderMaxUsdt || 0);
            orderFlowState.listingOwnerId = String(found.ownerId || '');
            orderFlowState.listingOwnerName = String(found.ownerName || 'User');
            orderFlowState.listingBankText = String(found.bankText || '');
            orderFlowState.listingBankAccountId = String(found.bankAccountId || '');
            var listingWalletRaw = String(found.tonWalletAddress || '');
            orderFlowState.listingTonWalletAddress = isValidTonAddressStrict(listingWalletRaw)
                ? normalizeTonAddressStrict(listingWalletRaw)
                : '';

            if (dom.orderOwnerName) dom.orderOwnerName.textContent = found.ownerName || 'User';
            if (dom.orderOwnerInitial) dom.orderOwnerInitial.textContent = String(found.ownerName || 'U').charAt(0).toUpperCase();
            if (dom.orderBuyPriceText) dom.orderBuyPriceText.textContent = found.buyPriceKrW != null ? (Math.floor(Number(found.buyPriceKrW)).toLocaleString() + ' KRW') : '—';
            if (dom.orderSellPriceText) dom.orderSellPriceText.textContent = found.sellPriceKrW != null ? (Math.floor(Number(found.sellPriceKrW)).toLocaleString() + ' KRW') : '—';
            if (dom.orderLimitText) dom.orderLimitText.textContent = Number(found.orderMinUsdt || 0).toLocaleString() + '~' + Number(found.orderMaxUsdt || 0).toLocaleString() + ' USDT';

            // 구매/판매 수취 정보 자동 채우기(데모)
            // - 구매: 수취지갑(내 TON 주소), 입금자명(내 기본 은행 계좌의 accountHolder)
            // - 판매: 수취계좌(내 기본 은행 계좌의 accountNumber), 지갑주소(내 TON 주소)
            var myTonAddr = getDefaultTonWalletAddress ? getDefaultTonWalletAddress() : null;
            var banks = loadBankAccounts();
            var defaultBankId = localStorage.getItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);
            var myBank = (Array.isArray(banks) ? banks : []).find(function (a) {
                return String(a.id) === String(defaultBankId);
            });
            var myBankAccountNumber = myBank && myBank.accountNumber ? String(myBank.accountNumber) : '';
            var myBankHolderName = myBank && myBank.accountHolder ? String(myBank.accountHolder) : '';

            if (dom.orderBuyReceiveWalletInput) {
                var buyWalletRaw = myTonAddr ? String(myTonAddr) : '';
                dom.orderBuyReceiveWalletInput.value = buyWalletRaw ? formatOrderWalletAddress(buyWalletRaw) : '';
                // 화면에는 마스킹 주소를 보여주되, 서버 저장 시에는 원본 주소를 사용
                dom.orderBuyReceiveWalletInput.dataset.rawWalletAddress = buyWalletRaw;
            }
            if (dom.orderBuyDepositNameInput) dom.orderBuyDepositNameInput.value = myBankHolderName;
            if (dom.orderSellReceiveAccountInput) dom.orderSellReceiveAccountInput.value = myBankAccountNumber;
            if (dom.orderSellWalletAddressInput) {
                var sellWalletRaw = myTonAddr ? String(myTonAddr) : '';
                dom.orderSellWalletAddressInput.value = sellWalletRaw ? formatOrderWalletAddress(sellWalletRaw) : '';
                dom.orderSellWalletAddressInput.dataset.rawWalletAddress = sellWalletRaw;
            }
            orderFlowState.buyUnitPrice = Number(found.sellPriceKrW || 0);
            orderFlowState.sellUnitPrice = Number(found.buyPriceKrW || 0);

            if (dom.orderUsdtInput) dom.orderUsdtInput.value = '';
            if (dom.orderKrwInput) dom.orderKrwInput.value = '';

            closeListingDetail();
            if (dom.marketplaceView) dom.marketplaceView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            if (dom.orderFlowView) dom.orderFlowView.classList.remove('hidden');

            var firstSide = initialSide === 'sell' ? 'sell' : 'buy';
            var canBuy = parseModeFlag(found.sellMode);  // 상대의 매도 리스팅에 대해 내가 구매
            var canSell = parseModeFlag(found.buyMode);  // 상대의 매수 리스팅에 대해 내가 판매
            if (canSell && !orderFlowState.listingTonWalletAddress) {
                canSell = false;
                if (tg && typeof tg.showAlert === 'function') {
                    tg.showAlert('상대방의 USDT 수취 지갑 주소가 올바르지 않아 판매 주문을 진행할 수 없습니다.');
                } else {
                    alert('상대방의 USDT 수취 지갑 주소가 올바르지 않아 판매 주문을 진행할 수 없습니다.');
                }
            }
            orderFlowState.canBuy = canBuy;
            orderFlowState.canSell = canSell;
            if (!canBuy && !canSell) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('이 리스팅은 현재 주문 가능한 거래 모드가 없습니다.');
                else alert('이 리스팅은 현재 주문 가능한 거래 모드가 없습니다.');
                return;
            }
            if (firstSide === 'buy' && !canBuy && canSell) firstSide = 'sell';
            if (firstSide === 'sell' && !canSell && canBuy) firstSide = 'buy';

            if (dom.orderBuyTabBtn) dom.orderBuyTabBtn.classList.toggle('hidden', !canBuy);
            if (dom.orderSellTabBtn) dom.orderSellTabBtn.classList.toggle('hidden', !canSell);

            switchOrderSide(firstSide);
            updateOrderSubmitButton();
        }

        /** TonConnect 위젯 루트 표시 복구(강제 숨김 후 다음 전송·연결용) */
        function restoreTonConnectWidgetRootVisible() {
            try {
                var root = document.getElementById('tc-widget-root');
                if (root) {
                    root.style.display = '';
                    root.removeAttribute('aria-hidden');
                }
            } catch (e) {}
        }

        /**
         * TonConnect 모달만 닫기(restore 없음 — sendTransaction 직후 restore가 SDK와 충돌할 수 있음)
         * 닫기 사유는 'wallet-selected'(@tonconnect/ui). ui.close()는 내부적으로 취소 알림을 유발할 수 있어 호출하지 않음.
         */
        function closeTonConnectModalOnly() {
            try {
                if (tonConnectUIInstance) {
                    if (typeof tonConnectUIInstance.closeModal === 'function') {
                        try { tonConnectUIInstance.closeModal('wallet-selected'); } catch (e0) {}
                    }
                    if (typeof tonConnectUIInstance.closeSingleWalletModal === 'function') {
                        try { tonConnectUIInstance.closeSingleWalletModal('wallet-selected'); } catch (eSw) {}
                    }
                    if (tonConnectUIInstance.modal && typeof tonConnectUIInstance.modal.close === 'function') {
                        try { tonConnectUIInstance.modal.close('wallet-selected'); } catch (e0b) {}
                    }
                }
            } catch (e) {}
        }

        /** 텔레그램 복귀 후에도 남는 Open Wallet·오버레이용: 위젯 루트를 잠시 숨김 */
        function hideTonConnectWidgetRootHard() {
            try {
                var root = document.getElementById('tc-widget-root');
                if (root) {
                    root.style.display = 'none';
                    root.setAttribute('aria-hidden', 'true');
                }
            } catch (e) {}
        }

        /** 모달 + 단일지갑 모달 + (선택) 위젯 DOM — 전송 대기 중에는 루트 숨김 금지(브리지 끊김 방지) */
        function closeTonConnectModalAggressive(hideWidgetRoot) {
            closeTonConnectModalOnly();
            if (hideWidgetRoot && !tonSendTransactionInFlight) {
                hideTonConnectWidgetRootHard();
            }
        }

        /**
         * 전송이 온체인/서버에 반영된 뒤에도 Open Wallet 레이어가 남는 경우 강제 정리.
         * sendUsdtJettonOnTestnet의 finally(450ms 지연) 동안 tonSendTransactionInFlight가 true라
         * closeTonConnectModalAggressive(true)가 위젯 루트를 숨기지 못하는 것이 주 원인.
         */
        function forceDismissTonConnectSendUi() {
            clearTonRestoreWhileSendTimers();
            tonSendTransactionInFlight = false;
            function kickOnce() {
                try {
                    closeTonConnectModalOnly();
                    hideTonConnectWidgetRootHard();
                } catch (eKick) {}
            }
            // 한 프레임에 한 번만 정리 — 여러 setTimeout으로 hide/restore를 반복하면 모달이 깜빡임
            kickOnce();
            try {
                requestAnimationFrame(function () {
                    kickOnce();
                });
            } catch (eRaf) {}
            setTimeout(function () {
                kickOnce();
            }, 400);
            setTimeout(function () {
                try {
                    restoreTonConnectionSafe();
                } catch (eRest) {}
            }, 160);
            // 위젯 루트는 여기서 복구하지 않음(복구 시 DOM이 잠깐 보였다 사라져 깜빡임). 다음 전송·지갑 연결 시 restoreTonConnectWidgetRootVisible 호출.
        }

        /** 전송이 이미 반영된 뒤 복귀했을 때 짧은 영문 안내(왼쪽 상단 토스트) */
        function showTonTransferCompletedHintEn() {
            try {
                if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.notificationOccurred === 'function') {
                    tg.HapticFeedback.notificationOccurred('success');
                }
            } catch (eH) {}
            var el = document.createElement('div');
            el.className = 'ton-transfer-toast';
            el.setAttribute('role', 'status');
            el.textContent = 'Transfer completed.';
            try {
                document.body.appendChild(el);
                requestAnimationFrame(function () {
                    el.classList.add('ton-transfer-toast--visible');
                });
            } catch (eApp) {
                if (tg && typeof tg.showPopup === 'function') {
                    try {
                        tg.showPopup(
                            { title: '', message: 'Transfer completed.', buttons: [{ type: 'ok', id: 'ok', text: 'OK' }] },
                            function () {}
                        );
                    } catch (eP) {}
                } else if (tg && typeof tg.showAlert === 'function') {
                    try {
                        tg.showAlert('Transfer completed.');
                    } catch (eA) {}
                }
                return;
            }
            setTimeout(function () {
                try {
                    el.classList.add('ton-transfer-toast--out');
                } catch (eO) {}
                setTimeout(function () {
                    try {
                        if (el.parentNode) el.parentNode.removeChild(el);
                    } catch (eRm) {}
                }, 380);
            }, 2200);
        }

        /** 모달 닫기 + 연결 복원(앱 알림·오버레이 정리용) */
        function forceCloseTonConnectUI() {
            closeTonConnectModalOnly();
            try {
                restoreTonConnectionSafe();
            } catch (e3) {}
        }

        /**
         * Tonkeeper에서 전송 후 텔레그램으로 복귀했을 때:
         * Open Wallet 모달을 닫고, 주문을 전송 완료 상태로 저장합니다(sendTransaction 대기와 무관).
         */
        async function tryCompleteTonOrderSendOnTelegramReturn() {
            var p = tonOrderSendPending;
            if (!p || !p.orderId) return;
            // 복귀 직후 로컬 목록이 비어 있거나 오래된 경우가 있어 서버에서 최신 주문을 먼저 가져옴
            try {
                var freshRows = await fetchOrdersFromSupabase();
                if (Array.isArray(freshRows)) myOffersState.orders = freshRows;
            } catch (eFetch) {}
            var target = (Array.isArray(myOffersState.orders) ? myOffersState.orders : []).find(function (o) {
                return String(o.id) === String(p.orderId);
            });
            var receiver;
            if (target && target.receiver && typeof target.receiver === 'object') {
                receiver = Object.assign({}, target.receiver);
            } else if (p.preSendReceiver && typeof p.preSendReceiver === 'object') {
                receiver = Object.assign({}, p.preSendReceiver);
            } else {
                tonOrderSendPending = null;
                // 복귀했는데 주문 데이터가 없어도 Open Wallet 레이어는 닫음
                try { closeTonConnectModalOnly(); hideTonConnectWidgetRootHard(); } catch (eEarly) {}
                return;
            }
            var uid0 = String(currentUserId || '');
            var youAreSeller0 = String(receiver.sellerId || '') === uid0;
            if (!youAreSeller0) {
                tonOrderSendPending = null;
                try { closeTonConnectModalOnly(); hideTonConnectWidgetRootHard(); } catch (eEarly2) {}
                return;
            }
            var st = String(receiver.status || '');
            // sendTransaction 결과가 먼저 반영돼 상태가 이미 전송 완료인 경우(스크린샷: 구매자 확인 대기)
            if (p.side === 'buy' && st === 'seller_sent') {
                tonOrderSendPending = null;
                forceDismissTonConnectSendUi();
                showTonTransferCompletedHintEn();
                return;
            }
            if (p.side === 'sell' && st === 'sell_coin_sent') {
                tonOrderSendPending = null;
                forceDismissTonConnectSendUi();
                showTonTransferCompletedHintEn();
                return;
            }
            if (p.side === 'sell') {
                if (st !== 'buyer_approved_sell' && st !== 'sell_buyer_issue_coin' && st !== 'sell_buyer_pending_coin_ack') {
                    tonOrderSendPending = null;
                    try { closeTonConnectModalOnly(); hideTonConnectWidgetRootHard(); } catch (eEarly3) {}
                    return;
                }
            } else {
                if (st !== 'buyer_paid' && st !== 'seller_deposit_checked' && st !== 'buyer_issue') {
                    tonOrderSendPending = null;
                    try { closeTonConnectModalOnly(); hideTonConnectWidgetRootHard(); } catch (eEarly4) {}
                    return;
                }
            }
            var now = Number(Date.now());
            if (p.side === 'sell') {
                receiver.status = 'sell_coin_sent';
                receiver.sellerSentAt = now;
                receiver.txid = 'TELEGRAM_RETURN_ASSUMED_OK';
            } else {
                receiver.status = 'seller_sent';
                receiver.sellerSentAt = now;
                receiver.txid = 'TELEGRAM_RETURN_ASSUMED_OK';
            }
            receiver.updatedAt = now;
            tonOrderSendResolvedByReturn = true;
            try {
                await patchOrderReceiverToSupabase(p.orderId, receiver);
                await refreshMyOffers();
            } catch (e) {
                tonOrderSendResolvedByReturn = false;
                var msg = '텔레그램 복귀 후 전송 완료 반영 실패: ' + String(e && e.message ? e.message : e);
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                else alert(msg);
                return;
            }
            tonOrderSendPending = null;
            forceDismissTonConnectSendUi();
        }

        /** Tonkeeper → 텔레그램 복귀·포커스 시: 모달 정리 + 전송 완료 처리(디바운스) */
        function scheduleTonOrderSendCompleteOnTelegramReturn() {
            if (!tonOrderSendPending || !tonOrderSendPending.orderId) {
                try {
                    forceDismissTonConnectSendUi();
                } catch (e) {}
                return;
            }
            try {
                forceDismissTonConnectSendUi();
            } catch (e0) {}
            void tryCompleteTonOrderSendOnTelegramReturn();
            if (tonTelegramReturnCompleteTimer) {
                try {
                    clearTimeout(tonTelegramReturnCompleteTimer);
                } catch (eClr) {}
            }
            tonTelegramReturnCompleteTimer = setTimeout(function () {
                tonTelegramReturnCompleteTimer = null;
                void tryCompleteTonOrderSendOnTelegramReturn();
            }, 200);
        }

        /** 주문 접수 완료 알림 닫기 후 내 주문(진행중)으로 이동 */
        function closeOrderSubmittedModalAndGoToMyOffers() {
            var overlay = document.getElementById('orderSubmittedOverlay');
            if (overlay) {
                overlay.classList.add('hidden');
                overlay.setAttribute('data-order-popup-variant', 'neutral');
            }
            forceCloseTonConnectUI();
            goToMyOffers();
            orderSubmittedOverlayAction = 'myOffers';
        }

        /** 주문 접수 완료·신규 요청 알림: 인앱 모달(확인 → 내 주문 진행중). opts.variant: buy | sell | both | neutral */
        function showOrderSubmittedPopupNavigatingToMyOffers(message, opts) {
            orderSubmittedOverlayAction = 'myOffers';
            var text = String(message || '');
            var variant = opts && opts.variant && /^(buy|sell|both|neutral)$/.test(String(opts.variant))
                ? String(opts.variant)
                : 'neutral';
            var overlay = document.getElementById('orderSubmittedOverlay');
            var msgEl = document.getElementById('orderSubmittedModalMessage');
            if (overlay && msgEl) {
                msgEl.textContent = text;
                overlay.setAttribute('data-order-popup-variant', variant);
                overlay.classList.remove('hidden');
                return;
            }
            if (tg && typeof tg.showPopup === 'function') {
                tg.showPopup({
                    title: '',
                    message: text,
                    buttons: [{ id: 'ok', type: 'default', text: '확인' }]
                }, function () {
                    goToMyOffers();
                });
                return;
            }
            if (tg && typeof tg.showAlert === 'function') {
                try {
                    tg.showAlert(text, function () {
                        goToMyOffers();
                    });
                } catch (e) {
                    tg.showAlert(text);
                    goToMyOffers();
                }
                return;
            }
            alert(text);
            goToMyOffers();
        }

        async function submitOrderDemo() {
            var sideTxt = orderFlowState.side === 'sell' ? '판매' : '구매';

            // 주문 직전 서버 최신 리스팅 모드 재검증(체크 해제 반영 지연/로컬 stale 방지)
            try {
                var latest = await fetchListingByIdFromSupabase(orderFlowState.listingId);
                if (latest) {
                    var latestCanBuy = parseModeFlag(latest.sellMode);
                    var latestCanSell = parseModeFlag(latest.buyMode);
                    if (latestCanSell) {
                        var latestWalletRaw = String(latest.tonWalletAddress || '');
                        if (!isValidTonAddressStrict(latestWalletRaw)) latestCanSell = false;
                    }
                    orderFlowState.canBuy = latestCanBuy;
                    orderFlowState.canSell = latestCanSell;
                }
            } catch (eModeSync) {}

            // 리스팅 설정과 다른 방향 주문은 차단
            if ((orderFlowState.side === 'buy' && !orderFlowState.canBuy) || (orderFlowState.side === 'sell' && !orderFlowState.canSell)) {
                var blockedMsg = orderFlowState.side === 'buy'
                    ? '이 리스팅은 현재 USDT 구매 요청을 받을 수 없습니다.'
                    : '이 리스팅은 현재 USDT 판매 요청을 받을 수 없습니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(blockedMsg);
                else alert(blockedMsg);
                return;
            }

            var usdt = parseOrderNumber(dom.orderUsdtInput ? dom.orderUsdtInput.value : 0);
            var krw = parseOrderNumber(dom.orderKrwInput ? dom.orderKrwInput.value : 0);

            // 수취 정보
            var receiver = {};
            if (orderFlowState.side === 'buy') {
                if (dom.orderBuyReceiveWalletInput) {
                    receiver.receiverWalletAddress = String(
                        dom.orderBuyReceiveWalletInput.dataset.rawWalletAddress || dom.orderBuyReceiveWalletInput.value || ''
                    );
                } else {
                    receiver.receiverWalletAddress = '';
                }
                receiver.depositName = dom.orderBuyDepositNameInput ? dom.orderBuyDepositNameInput.value : '';
                receiver.status = 'pending_seller';
                receiver.buyerId = String(currentUserId || '');
                receiver.buyerName = String(currentUserName || 'User');
                receiver.sellerId = String(orderFlowState.listingOwnerId || '');
                receiver.sellerName = String(orderFlowState.listingOwnerName || 'User');
                receiver.sellerBankText = String(orderFlowState.listingBankText || '');
                receiver.sellerBankAccountId = String(orderFlowState.listingBankAccountId || '');
                var listingBank = parseBankTextParts(orderFlowState.listingBankText || '');
                receiver.sellerBankName = listingBank.bankName || '';
                receiver.sellerBankAccountNumber = listingBank.accountNumber || '';
                receiver.sellerBankAccountHolder = listingBank.accountHolder || '';
                receiver.sellerTonWalletAddress = String(orderFlowState.listingTonWalletAddress || '');
            } else {
                // 판매: 리스팅 주인이 USDT를 사고, 주문자가 USDT를 팜 → buyerId=리스팅 주인, sellerId=주문자
                var sellWalletRaw = '';
                if (dom.orderSellWalletAddressInput) {
                    sellWalletRaw = String(
                        dom.orderSellWalletAddressInput.dataset.rawWalletAddress || dom.orderSellWalletAddressInput.value || ''
                    ).replace(/\s+/g, '');
                }
                receiver.receiveAccountNumber = dom.orderSellReceiveAccountInput ? dom.orderSellReceiveAccountInput.value : '';
                receiver.receiverWalletAddress = sellWalletRaw;
                receiver.buyerReceiverWalletAddress = String(orderFlowState.listingTonWalletAddress || '');
                receiver.status = 'pending_buyer';
                receiver.buyerId = String(orderFlowState.listingOwnerId || '');
                receiver.buyerName = String(orderFlowState.listingOwnerName || 'User');
                receiver.sellerId = String(currentUserId || '');
                receiver.sellerName = String(currentUserName || 'User');
                var banks = loadBankAccounts();
                var defaultBankId = localStorage.getItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);
                var myBank = (Array.isArray(banks) ? banks : []).find(function (a) {
                    return String(a.id) === String(defaultBankId);
                });
                if (myBank) {
                    receiver.sellerBankName = String(myBank.bank || '');
                    receiver.sellerBankAccountNumber = String(myBank.accountNumber || '');
                    receiver.sellerBankAccountHolder = String(myBank.accountHolder || '');
                    receiver.sellerBankText = receiver.sellerBankName + ' | ' + receiver.sellerBankAccountNumber + ' | ' + receiver.sellerBankAccountHolder;
                    receiver.sellerBankAccountId = String(myBank.id || '');
                } else {
                    receiver.sellerBankName = '';
                    receiver.sellerBankAccountNumber = String(receiver.receiveAccountNumber || '');
                    receiver.sellerBankAccountHolder = '';
                    receiver.sellerBankText = '';
                    receiver.sellerBankAccountId = '';
                }
                receiver.sellerTonWalletAddress = '';
            }

            receiver.sellerApprovedAt = null;
            receiver.buyerPaidAt = null;
            receiver.sellerSentAt = null;
            receiver.buyerConfirmedAt = null;
            receiver.txid = '';
            receiver.issueNote = '';
            receiver.updatedAt = Number(Date.now());

            var posted = false;
            var errDetail = '';
            var newOrderId = String(Date.now());
            try {
                var res = await fetch(SUPABASE_URL + '/rest/v1/orders', {
                    method: 'POST',
                    headers: supabaseHeaders({ 'Prefer': 'return=representation' }),
                    body: JSON.stringify([{
                        id: newOrderId,
                        listing_id: String(orderFlowState.listingId || ''),
                        side: String(orderFlowState.side || ''),
                        usdt: Number(usdt || 0),
                        krw: Number(krw || 0),
                        receiver: receiver,
                        created_at: Number(Date.now())
                    }])
                });
                if (res && res.ok) {
                    posted = true;
                } else {
                    errDetail = 'HTTP ' + (res ? res.status : 'unknown');
                    try {
                        if (res && typeof res.text === 'function') {
                            var txt = await res.text();
                            if (txt) errDetail += ' · ' + txt;
                        }
                    } catch (e) {}
                }
            } catch (e) {
                posted = false;
                errDetail = String(e && e.message ? e.message : e);
            }

            if (posted) {
                // ORDER_NOTIFY_SECRET이 있으면 Edge만, 없으면 클라이언트 DM만 (둘 다 호출 시 중복 발송 방지)
                var orderNotifySecret = String(ORDER_NOTIFY_SECRET || '').trim();
                if (orderNotifySecret) {
                    void notifyNewOrderTelegram(newOrderId);
                } else {
                    void notifyNewOrderTelegramClient(newOrderId, orderFlowState.side, receiver, usdt, krw);
                }
            }

            var msg = posted
                ? (orderFlowState.side === 'sell'
                    ? '판매 주문이 접수되었습니다.\n\n구매자(리스팅 주인) 승인을 기다려 주세요.'
                    : '구매 주문이 접수되었습니다.\n\n판매자 승인을 기다려 주세요.')
                : (sideTxt + ' 주문 저장이 실패했습니다. ' + (errDetail ? ('· ' + errDetail) : ''));

            closeOrderFlow();
            await loadMarketplace();
            await pollOrdersRealtime();

            if (posted) {
                showOrderSubmittedPopupNavigatingToMyOffers(msg, {
                    variant: orderFlowState.side === 'sell' ? 'sell' : 'buy'
                });
            } else {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                else alert(msg);
            }
        }

        async function fetchOrdersFromSupabase() {
            var res = await fetch(SUPABASE_URL + '/rest/v1/orders?select=*&order=created_at.desc&limit=200', {
                headers: supabaseHeaders({ 'Accept': 'application/json' }),
                cache: 'no-store'
            });
            if (!res.ok) throw new Error('orders fetch failed: ' + res.status);
            var rows;
            try {
                rows = await res.json();
            } catch (e) {
                return [];
            }
            return Array.isArray(rows) ? rows : [];
        }

        async function patchOrderReceiverToSupabase(orderId, receiverObj) {
            var url = SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(String(orderId));
            var res = await fetch(url, {
                method: 'PATCH',
                headers: supabaseHeaders({ 'Prefer': 'return=representation' }),
                body: JSON.stringify({ receiver: receiverObj })
            });
            if (!res.ok) {
                var txt = '';
                try { txt = await res.text(); } catch (e) {}
                throw new Error('order patch failed: ' + res.status + (txt ? (' · ' + txt) : ''));
            }
            var rows = null;
            try {
                var bodyText = await res.text();
                if (bodyText && bodyText.trim()) rows = JSON.parse(bodyText);
            } catch (eParse) {
                rows = null;
            }
            return Array.isArray(rows) ? rows[0] : null;
        }

        function setMyOffersTab(tab) {
            myOffersState.tab = tab === 'history' ? 'history' : 'active';
            var buyActive = myOffersState.tab === 'active';
            var buyTab = document.getElementById('myOffersBuyTab');
            var sellTab = document.getElementById('myOffersSellTab');
            if (buyTab) buyTab.classList.toggle('active', buyActive);
            if (sellTab) sellTab.classList.toggle('active', !buyActive);
            renderMyOffers();
        }

        function goToMyOffers() {
            closeMenu();
            clearKycAlertTimer();
            closeListingDetail();
            if (dom.kycView) dom.kycView.classList.add('hidden');
            if (dom.kycCompleteView) dom.kycCompleteView.classList.add('hidden');
            if (dom.myPageView) dom.myPageView.classList.add('hidden');
            if (dom.marketplaceView) dom.marketplaceView.classList.add('hidden');
            if (dom.orderFlowView) dom.orderFlowView.classList.add('hidden');
            if (dom.listingCreateView) dom.listingCreateView.classList.add('hidden');
            if (dom.listingConfirmView) dom.listingConfirmView.classList.add('hidden');
            var el = document.getElementById('myOffersView');
            if (el) el.classList.remove('hidden');
            setMyOffersTab('active');
            refreshMyOffers();
        }

        function goToMyOffersHistory() {
            goToMyOffers();
            setMyOffersTab('history');
        }

        /** 주문 카드 DOM id용 (HTML id 안전 문자만) */
        function offerBuyerBalanceSafeId(orderId) {
            return 'offerBuyerBal-' + String(orderId || 'x').replace(/[^a-zA-Z0-9_-]/g, '_');
        }

        /**
         * 판매자가 USDT 전송을 마친 뒤 구매자 화면에서만 잔액 표시
         * - USDT 구매 주문(side buy): receiverWalletAddress
         * - USDT 판매 리스팅(side sell, 구매자=리스팅 주인): buyerReceiverWalletAddress
         */
        function shouldShowBuyerWalletBalance(orderSide, status, youAreBuyer) {
            if (!youAreBuyer) return false;
            var st = String(status || '');
            if (orderSide === 'sell') {
                return (
                    [
                        'sell_coin_sent',
                        'sell_buyer_issue_coin',
                        'sell_buyer_pending_coin_ack',
                        'sell_fiat_paid',
                        'sell_seller_issue_fiat',
                        'buyer_confirmed'
                    ].indexOf(st) !== -1
                );
            }
            return ['seller_sent', 'buyer_issue', 'buyer_confirmed'].indexOf(st) !== -1;
        }

        function getBuyerWalletAddressForBalance(order, orderSide) {
            var r = order && order.receiver && typeof order.receiver === 'object' ? order.receiver : {};
            if (orderSide === 'sell') return String(r.buyerReceiverWalletAddress || '').trim();
            return String(r.receiverWalletAddress || '').trim();
        }

        /** renderMyOffers 직후 TonAPI로 구매자 지갑 USDT 잔액 채움 */
        function fillOfferBuyerWalletBalances(rows) {
            var userId = String(currentUserId || '');
            (Array.isArray(rows) ? rows : []).forEach(function (o) {
                var r = o && o.receiver && typeof o.receiver === 'object' ? o.receiver : {};
                var status = String(r.status || '');
                var orderSide = getOrderSide(o);
                var youAreBuyer = String(r.buyerId || '') === userId;
                if (!shouldShowBuyerWalletBalance(orderSide, status, youAreBuyer)) return;
                var addr = getBuyerWalletAddressForBalance(o, orderSide);
                if (!addr || addr.indexOf('.....') !== -1) return;
                var el = document.getElementById(offerBuyerBalanceSafeId(o.id));
                if (!el) return;
                fetchJettonUsdtBalance(addr).then(function (n) {
                    if (!el || !el.parentNode) return;
                    if (n === null || n === undefined) el.textContent = '—';
                    else el.textContent = Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' USDT';
                }).catch(function () {
                    if (el && el.parentNode) el.textContent = '조회 실패';
                });
            });
        }

        function renderMyOffers() {
            var wrap = document.getElementById('myOffersList');
            if (!wrap) return;
            var userId = String(currentUserId || '');
            var showHistory = myOffersState.tab === 'history';
            var rows = (Array.isArray(myOffersState.orders) ? myOffersState.orders : []).filter(function (o) {
                var r = o && o.receiver && typeof o.receiver === 'object' ? o.receiver : {};
                var involved = String(r.buyerId || '') === userId || String(r.sellerId || '') === userId;
                if (!involved) return false;
                var st = String(r.status || '');
                var finished = st === 'buyer_confirmed' || st === 'seller_rejected' || st === 'buyer_cancelled'
                    || st === 'buyer_rejected_sell' || st === 'seller_cancelled_sell';
                return showHistory ? finished : !finished;
            });
            if (!rows.length) {
                var emptyTxt = getUiTexts();
                var emptyMsg = showHistory ? emptyTxt.myOffersEmptyHistory : emptyTxt.myOffersEmptyActive;
                wrap.innerHTML = '<div class="offer-empty">' + emptyMsg + '</div>';
                return;
            }
            wrap.innerHTML = rows.map(function (o) {
                var r = o && o.receiver && typeof o.receiver === 'object' ? o.receiver : {};
                var orderSide = getOrderSide(o);
                var status = String(r.status || (orderSide === 'sell' ? 'pending_buyer' : 'pending_seller'));
                var statusTone = orderStatusTone(status);
                var youAreBuyer = String(r.buyerId || '') === userId;
                var counterName = youAreBuyer ? String(r.sellerName || '판매자') : String(r.buyerName || '구매자');
                var total = Number(o.krw || 0).toLocaleString() + ' KRW';
                var price = Number(o.usdt || 0) > 0 ? (Number(o.krw || 0) / Number(o.usdt || 0)) : 0;

                var progressHint = getOfferProgressHintText(status, orderSide, youAreBuyer);
                var progressHtml =
                    '<div class="offer-divider"></div>' +
                    '<div class="offer-line"><div class="offer-k">진행 안내</div><div class="offer-v">' +
                    escapeHtml(progressHint) +
                    '</div></div>';

                var extra = '';
                if (orderSide === 'sell') {
                    if (status === 'buyer_approved_sell' && !youAreBuyer) {
                        var coinTo = String(r.buyerReceiverWalletAddress || '');
                        var coinToEsc = escapeJsSingleQuote(coinTo);
                        extra =
                            '<div class="offer-divider"></div>' +
                            '<div class="offer-line"><div class="offer-k">구매자 USDT 수취 지갑</div><div class="offer-v offer-v--wrap">' +
                            (coinTo
                                ? ('<span class="offer-copy-link" onclick="copyOfferValue(\'' + coinToEsc + '\', \'지갑주소\')">' + escapeHtml(coinTo) + '</span>')
                                : '-') +
                            '</div></div>';
                    } else if (status === 'sell_buyer_issue_coin' && !youAreBuyer) {
                        var coinTo2 = String(r.buyerReceiverWalletAddress || '');
                        var coinToEsc2 = escapeJsSingleQuote(coinTo2);
                        extra =
                            '<div class="offer-divider"></div>' +
                            '<div class="offer-line"><div class="offer-k">구매자 USDT 수취 지갑</div><div class="offer-v offer-v--wrap">' +
                            (coinTo2
                                ? ('<span class="offer-copy-link" onclick="copyOfferValue(\'' + coinToEsc2 + '\', \'지갑주소\')">' + escapeHtml(coinTo2) + '</span>')
                                : '-') +
                            '</div></div>' +
                            '<div class="offer-line"><div class="offer-k">구매자 요청</div><div class="offer-v">' + escapeHtml(r.issueNote || 'USDT 전송 확인 요청') + '</div></div>' +
                            (r.sellerCoinIssueReply
                                ? ('<div class="offer-line"><div class="offer-k">내 답변</div><div class="offer-v">' + escapeHtml(String(r.sellerCoinIssueReply)) + '</div></div>')
                                : '');
                    } else if (status === 'sell_coin_sent' && youAreBuyer) {
                        var bankS = {
                            bankName: String(r.sellerBankName || ''),
                            accountNumber: String(r.sellerBankAccountNumber || ''),
                            accountHolder: String(r.sellerBankAccountHolder || '')
                        };
                        if (!bankS.bankName && !bankS.accountNumber && !bankS.accountHolder) {
                            bankS = parseBankTextParts(r.sellerBankText || '');
                        }
                        var accNumSEsc = escapeJsSingleQuote(bankS.accountNumber || '');
                        extra =
                            '<div class="offer-divider"></div>' +
                            '<div class="offer-line"><div class="offer-k">판매자 계좌(입금)</div><div class="offer-v">' + escapeHtml(bankS.bankName || '-') + '</div></div>' +
                            '<div class="offer-line"><div class="offer-k">계좌번호</div><div class="offer-v">' +
                            (bankS.accountNumber
                                ? ('<span class="offer-copy-link" onclick="copyOfferValue(\'' + accNumSEsc + '\', \'계좌번호\')">' + escapeHtml(bankS.accountNumber) + '</span>')
                                : '-') +
                            '</div></div>' +
                            '<div class="offer-line"><div class="offer-k">예금주</div><div class="offer-v">' + escapeHtml(bankS.accountHolder || '-') + '</div></div>' +
                            '<div class="offer-line"><div class="offer-k">TxID</div><div class="offer-v offer-v--wrap">' + escapeHtml(r.txid || '-') + '</div></div>';
                    } else if (status === 'sell_buyer_issue_coin' && youAreBuyer) {
                        extra =
                            '<div class="offer-divider"></div>' +
                            '<div class="offer-line"><div class="offer-k">내 요청</div><div class="offer-v">' +
                            escapeHtml(r.issueNote || 'USDT 전송 확인 요청') +
                            '</div></div>' +
                            (r.sellerCoinIssueReply
                                ? ('<div class="offer-line"><div class="offer-k">판매자 답변</div><div class="offer-v">' + escapeHtml(String(r.sellerCoinIssueReply)) + '</div></div>')
                                : '');
                    } else if (status === 'sell_buyer_pending_coin_ack' && !youAreBuyer) {
                        var coinTo3 = String(r.buyerReceiverWalletAddress || '');
                        var coinToEsc3 = escapeJsSingleQuote(coinTo3);
                        extra =
                            '<div class="offer-divider"></div>' +
                            '<div class="offer-line"><div class="offer-k">구매자 USDT 수취 지갑</div><div class="offer-v offer-v--wrap">' +
                            (coinTo3
                                ? ('<span class="offer-copy-link" onclick="copyOfferValue(\'' + coinToEsc3 + '\', \'지갑주소\')">' + escapeHtml(coinTo3) + '</span>')
                                : '-') +
                            '</div></div>' +
                            '<div class="offer-line"><div class="offer-k">구매자 요청</div><div class="offer-v">' + escapeHtml(r.issueNote || 'USDT 전송 확인 요청') + '</div></div>' +
                            (r.sellerCoinIssueReply
                                ? ('<div class="offer-line"><div class="offer-k">내 답변</div><div class="offer-v">' + escapeHtml(String(r.sellerCoinIssueReply)) + '</div></div>')
                                : '') +
                            '<div class="offer-line"><div class="offer-k">TxID</div><div class="offer-v offer-v--wrap">' + escapeHtml(r.txid || '-') + '</div></div>';
                    } else if (status === 'sell_buyer_pending_coin_ack' && youAreBuyer) {
                        extra =
                            '<div class="offer-divider"></div>' +
                            '<div class="offer-line"><div class="offer-k">내 요청</div><div class="offer-v">' + escapeHtml(r.issueNote || 'USDT 전송 확인 요청') + '</div></div>' +
                            (r.sellerCoinIssueReply
                                ? ('<div class="offer-line"><div class="offer-k">판매자 답변</div><div class="offer-v">' + escapeHtml(String(r.sellerCoinIssueReply)) + '</div></div>')
                                : '') +
                            '<div class="offer-line"><div class="offer-k">TxID</div><div class="offer-v offer-v--wrap">' + escapeHtml(r.txid || '-') + '</div></div>';
                    }
                } else if (status === 'seller_approved' && youAreBuyer) {
                    var bankParts = {
                        bankName: String(r.sellerBankName || ''),
                        accountNumber: String(r.sellerBankAccountNumber || ''),
                        accountHolder: String(r.sellerBankAccountHolder || '')
                    };
                    if (!bankParts.bankName && !bankParts.accountNumber && !bankParts.accountHolder) {
                        bankParts = parseBankTextParts(r.sellerBankText || '');
                    }
                    var accNumEsc = escapeJsSingleQuote(bankParts.accountNumber || '');
                    extra =
                        '<div class="offer-divider"></div>' +
                        '<div class="offer-line"><div class="offer-k">은행명</div><div class="offer-v">' + escapeHtml(bankParts.bankName || '-') + '</div></div>' +
                        '<div class="offer-line"><div class="offer-k">계좌번호</div><div class="offer-v">' +
                            (bankParts.accountNumber
                                ? ('<span class="offer-copy-link" onclick="copyOfferValue(\'' + accNumEsc + '\', \'계좌번호\')">' + escapeHtml(bankParts.accountNumber) + '</span>')
                                : '-') +
                        '</div></div>' +
                        '<div class="offer-line"><div class="offer-k">입금자명</div><div class="offer-v">' + escapeHtml(bankParts.accountHolder || '-') + '</div></div>';
                } else if (status === 'buyer_paid' && !youAreBuyer) {
                    // 구매자가 입금 완료한 뒤 판매자가 코인 전송할 수 있도록 구매자 지갑주소를 제공
                    var buyWallet = String(r.receiverWalletAddress || '');
                    var buyWalletEsc = escapeJsSingleQuote(buyWallet);
                    extra = '<div class="offer-divider"></div><div class="offer-line"><div class="offer-k">구매자 지갑주소</div><div class="offer-v offer-v--wrap">' +
                        (buyWallet
                            ? ('<span class="offer-copy-link" onclick="copyOfferValue(\'' + buyWalletEsc + '\', \'지갑주소\')">' + escapeHtml(buyWallet) + '</span>')
                            : '-') +
                    '</div></div>';
                } else if (status === 'buyer_issue' && !youAreBuyer) {
                    var buyWallet2 = String(r.receiverWalletAddress || '');
                    var buyWalletEsc2 = escapeJsSingleQuote(buyWallet2);
                    extra = '<div class="offer-divider"></div><div class="offer-line"><div class="offer-k">구매자 지갑주소</div><div class="offer-v offer-v--wrap">' +
                        (buyWallet2
                            ? ('<span class="offer-copy-link" onclick="copyOfferValue(\'' + buyWalletEsc2 + '\', \'지갑주소\')">' + escapeHtml(buyWallet2) + '</span>')
                            : '-') +
                    '</div></div>';
                } else if (status === 'seller_sent' && youAreBuyer) {
                    extra = '<div class="offer-divider"></div><div class="offer-line"><div class="offer-k">TxID</div><div class="offer-v offer-v--wrap">' + escapeHtml(r.txid || '-') + '</div></div>';
                } else if (status === 'buyer_issue' && youAreBuyer) {
                    extra =
                        '<div class="offer-divider"></div>' +
                        '<div class="offer-line"><div class="offer-k">요청 내용</div><div class="offer-v">' +
                        escapeHtml(r.issueNote || '입금/전송 상태 확인 요청') +
                        '</div></div>';
                }

                // 판매자 전송 완료 후 구매자: 보유 지갑 USDT 잔액(비동기 조회)
                if (shouldShowBuyerWalletBalance(orderSide, status, youAreBuyer)) {
                    var wBal = getBuyerWalletAddressForBalance(o, orderSide);
                    if (wBal && wBal.indexOf('.....') === -1) {
                        extra +=
                            '<div class="offer-divider"></div>' +
                            '<div class="offer-line"><div class="offer-k">내 지갑 USDT 잔액</div><div class="offer-v" id="' +
                            offerBuyerBalanceSafeId(o.id) +
                            '">조회 중…</div></div>';
                    }
                }

                var actions = buildOrderActionButtons(o, status, youAreBuyer);
                // 거래 내역 탭: 카드 탭 시 영수증형 상세 모달
                var cardOpenTag = showHistory
                    ? '<div class="offer-card offer-card--receipt" role="button" tabindex="0" onclick="onHistoryOfferCardClick(event, \'' +
                      escapeJsSingleQuote(String(o.id || '')) +
                      '\')">'
                    : '<div class="offer-card">';
                return (
                    '' +
                    cardOpenTag +
                    '<div class="offer-head">' +
                    '<div class="offer-name">' +
                    escapeHtml(counterName) +
                    '</div>' +
                    '<div class="offer-status offer-status--' +
                    statusTone +
                    '">' +
                    escapeHtml(orderStatusLabel(status)) +
                    '</div>' +
                    '</div>' +
                    '<div class="offer-line"><div class="offer-k">가격</div><div class="offer-v">' +
                    Math.floor(price).toLocaleString() +
                    ' KRW/USDT</div></div>' +
                    '<div class="offer-line"><div class="offer-k">유형</div><div class="offer-v">' +
                    (orderSide === 'sell' ? 'USDT 판매' : 'USDT 구매') +
                    '</div></div>' +
                    '<div class="offer-line"><div class="offer-k">금액</div><div class="offer-v">' +
                    Number(o.usdt || 0).toLocaleString() +
                    ' USDT</div></div>' +
                    '<div class="offer-line"><div class="offer-k">합계</div><div class="offer-v">' +
                    total +
                    '</div></div>' +
                    progressHtml +
                    extra +
                    (actions ? '<div class="offer-actions">' + actions + '</div>' : '') +
                    (showHistory ? '<div class="offer-receipt-hint">탭하여 상세 · 영수증 보기</div>' : '') +
                    '</div>'
                );
            }).join('');
            fillOfferBuyerWalletBalances(rows);
        }

        function buildOrderActionButtons(order, status, youAreBuyer) {
            var id = String(order && order.id ? order.id : '');
            if (!id) return '';
            var side = getOrderSide(order);
            if (side === 'sell') {
                if (youAreBuyer && status === 'pending_buyer') {
                    return '' +
                        '<button class="offer-btn offer-btn--danger" type="button" onclick="handleOrderAction(\'' + id + '\', \'reject\')">거절</button>' +
                        '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'approve\')">승인</button>';
                }
                if (!youAreBuyer && status === 'pending_buyer') {
                    return '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'cancel\')">신청 취소</button>';
                }
                if (!youAreBuyer && status === 'buyer_approved_sell') {
                    return '' +
                        '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'cancel\')">거래 취소</button>' +
                        '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'sent\')">전송하기</button>';
                }
                if (youAreBuyer && status === 'sell_coin_sent') {
                    return '' +
                        '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'issue\')">확인요청</button>' +
                        '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'paid\')">입금 완료</button>';
                }
                if (!youAreBuyer && status === 'sell_buyer_issue_coin') {
                    return '' +
                        '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'issue_seller_coin\')">확인요청</button>' +
                        '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'sent\')">전송하기</button>';
                }
                if (youAreBuyer && status === 'sell_buyer_pending_coin_ack') {
                    return '' +
                        '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'issue\')">추가 확인요청</button>' +
                        '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'buyer_confirm_usdt_received\')">USDT 수령 확인</button>';
                }
                if (!youAreBuyer && status === 'sell_buyer_pending_coin_ack') {
                    return '' +
                        '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'issue_seller_coin\')">확인요청</button>' +
                        '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'sent\')">전송하기</button>';
                }
                if (!youAreBuyer && status === 'sell_fiat_paid') {
                    return '' +
                        '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'issue_sell_fiat\')">확인요청</button>' +
                        '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'confirm\')">거래 완료</button>';
                }
                if (youAreBuyer && status === 'sell_seller_issue_fiat') {
                    return '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'paid\')">입금완료(재확인)</button>';
                }
                // 입금 재확인 요청 후에는 구매자 응답 대기 — 판매자에게 거래 완료 버튼 표시하지 않음
                if (!youAreBuyer && status === 'sell_seller_issue_fiat') {
                    return '';
                }
                return '';
            }
            if (!youAreBuyer && status === 'pending_seller') {
                return '' +
                    '<button class="offer-btn offer-btn--danger" type="button" onclick="handleOrderAction(\'' + id + '\', \'reject\')">거절</button>' +
                    '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'approve\')">승인</button>';
            }
            if (youAreBuyer && status === 'seller_approved') {
                return '' +
                    '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'cancel\')">거래 취소</button>' +
                    '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'paid\')">입금 완료</button>';
            }
            if (!youAreBuyer && status === 'buyer_paid') {
                return '' +
                    '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'request_payment_check\')">확인요청</button>' +
                    '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'sent\')">전송하기</button>';
            }
            if (!youAreBuyer && status === 'seller_deposit_checked') {
                return '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'sent\')">전송하기</button>';
            }
            if (youAreBuyer && status === 'seller_payment_check_requested') {
                return '' +
                    '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'cancel\')">거래 취소</button>' +
                    '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'paid\')">입금 완료(재확인)</button>';
            }
            if (!youAreBuyer && status === 'buyer_issue') {
                return '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'sent\')">전송하기</button>';
            }
            if (youAreBuyer && status === 'seller_sent') {
                return '' +
                    '<button class="offer-btn offer-btn--ghost" type="button" onclick="handleOrderAction(\'' + id + '\', \'issue\')">확인 요청</button>' +
                    '<button class="offer-btn offer-btn--primary" type="button" onclick="handleOrderAction(\'' + id + '\', \'confirm\')">거래 완료</button>';
            }
            return '';
        }

        async function refreshMyOffers() {
            var wrap = document.getElementById('myOffersList');
            if (wrap) wrap.innerHTML = '<div class="offer-empty">주문을 불러오는 중...</div>';
            await pollOrdersRealtime();
            if (!Array.isArray(myOffersState.orders) || myOffersState.orders.length === 0) {
                renderMyOffers();
            }
        }

        async function confirmManualTransferCompletion(sendErr) {
            // Tonkeeper 승인 후 텔레그램 복귀가 끊기는 환경에서, 실제 전송 완료를 사용자가 확인해 상태 반영
            var detail = String(sendErr && sendErr.message ? sendErr.message : sendErr || '').trim();
            var ask = 'Tonkeeper에서 승인/전송을 이미 완료했나요?\n완료했다면 "확인"을 눌러 주문 상태를 전송 완료로 반영합니다.';
            if (detail) ask += '\n\n오류 정보: ' + detail;
            try {
                if (tg && typeof tg.showConfirm === 'function') {
                    return await new Promise(function (resolve) {
                        tg.showConfirm(ask, function (ok) { resolve(!!ok); });
                    });
                }
            } catch (e) {}
            try {
                return !!window.confirm(ask);
            } catch (e2) {
                return false;
            }
        }

        function isTonTxTimeoutAfterApprovalError(err) {
            // SDK가 Error가 아닌 형태로 던지거나 message가 중첩될 수 있어 문자열 전체를 검사
            var parts = [];
            try {
                if (err && typeof err === 'object') {
                    if (err.message) parts.push(String(err.message));
                    if (err.cause && err.cause.message) parts.push(String(err.cause.message));
                }
            } catch (e) {}
            try {
                parts.push(String(err || ''));
            } catch (e2) {}
            var blob = parts.join(' ');
            return blob.indexOf('TON_TX_TIMEOUT_AFTER_APPROVAL') !== -1;
        }

        /** 지갑 미연결·테스트넷·주소 등 '전송 시도 전' 실패 — 수동 완료 확인(톤키퍼에서 이미 보냈나요?)을 띄우면 안 됨 */
        function shouldOfferManualTransferConfirm(err) {
            var blob = '';
            try {
                if (err && typeof err === 'object' && err.message) blob += String(err.message) + ' ';
            } catch (e0) {}
            try {
                blob += String(err || '');
            } catch (e1) {}
            var deny = [
                '연결된 TON 지갑이 없습니다',
                '테스트넷 지갑으로 연결해 주세요',
                'TON Connect를 불러오지 못했습니다',
                '테스트넷 USDT 마스터',
                '마스킹 주소',
                '마스킹되어',
                '수신 지갑 주소가 없습니다',
                '수취 지갑',
                '지갑 전송 기능을 사용할 수 없습니다',
                'TON 지갑 연결 창을 열지 못했습니다'
            ];
            for (var i = 0; i < deny.length; i++) {
                if (blob.indexOf(deny[i]) !== -1) return false;
            }
            return true;
        }

        async function handleOrderAction(orderId, action) {
            var target = (Array.isArray(myOffersState.orders) ? myOffersState.orders : []).find(function (o) {
                return String(o.id) === String(orderId);
            });
            if (!target) return;
            var receiver = Object.assign({}, (target.receiver && typeof target.receiver === 'object') ? target.receiver : {});
            var now = Number(Date.now());
            var side = getOrderSide(target);
            var r0 = receiver;
            var uid0 = String(currentUserId || '');
            var youAreBuyer0 = String(r0.buyerId || '') === uid0;
            var youAreSeller0 = String(r0.sellerId || '') === uid0;
            // USDT 판매 주문: 구매자(리스팅 주인) 승인 → 판매자 전송 → 구매자 원화 입금 → 판매자 완료
            if (side === 'sell') {
                if (action === 'approve') {
                    if (!youAreBuyer0 || String(r0.status) !== 'pending_buyer') return;
                    receiver.status = 'buyer_approved_sell';
                    receiver.buyerApprovedAt = now;
                } else if (action === 'reject') {
                    if (!youAreBuyer0 || String(r0.status) !== 'pending_buyer') return;
                    var rrSell = '';
                    try {
                        rrSell = prompt('거절 사유를 입력해 주세요. (선택)', '') || '';
                    } catch (eRjS) {}
                    // 영수증·상세 내역에 표시할 거절 사유
                    receiver.rejectReason = String(rrSell || '').trim() || '(사유 미입력)';
                    receiver.status = 'buyer_rejected_sell';
                } else if (action === 'cancel') {
                    if (!youAreSeller0 || (String(r0.status) !== 'pending_buyer' && String(r0.status) !== 'buyer_approved_sell')) return;
                    var cnSell = '';
                    try {
                        cnSell = prompt('취소 사유를 입력해 주세요. (선택)', '') || '';
                    } catch (eCnS) {}
                    receiver.cancelNote = String(cnSell || '').trim() || '(메모 없음)';
                    receiver.status = 'seller_cancelled_sell';
                    receiver.sellerCancelledAt = now;
                } else if (action === 'sent') {
                    var stSend = String(r0.status || '');
                    if (!youAreSeller0 || (stSend !== 'buyer_approved_sell' && stSend !== 'sell_buyer_issue_coin' && stSend !== 'sell_buyer_pending_coin_ack')) return;
                    var sellToAddress = String(r0.buyerReceiverWalletAddress || '').trim();
                    var txidSell = '';
                    try {
                        if (sellToAddress.indexOf('.....') !== -1) {
                            throw new Error('구매자 수취 지갑이 마스킹 주소입니다. 원본 주소로 다시 주문해 주세요.');
                        }
                        txidSell = await sendUsdtJettonOnTestnet(sellToAddress, target.usdt, {
                            orderId: String(orderId),
                            side: 'sell',
                            preSendReceiver: Object.assign({}, receiver)
                        });
                        if (tonOrderSendResolvedByReturn) {
                            tonOrderSendResolvedByReturn = false;
                            tonOrderSendPending = null;
                            forceDismissTonConnectSendUi();
                            return;
                        }
                    } catch (sendErrSell) {
                        if (tonOrderSendResolvedByReturn) {
                            tonOrderSendResolvedByReturn = false;
                            tonOrderSendPending = null;
                            forceDismissTonConnectSendUi();
                            return;
                        }
                        if (isTonTxTimeoutAfterApprovalError(sendErrSell)) {
                            txidSell = 'TIMEOUT_AFTER_APPROVAL_ASSUMED_OK';
                        } else if (!shouldOfferManualTransferConfirm(sendErrSell)) {
                            tonOrderSendPending = null;
                            forceDismissTonConnectSendUi();
                            var preSell = String(sendErrSell && sendErrSell.message ? sendErrSell.message : sendErrSell);
                            if (tg && typeof tg.showAlert === 'function') tg.showAlert(preSell);
                            else alert(preSell);
                            return;
                        } else {
                        var completedSell = await confirmManualTransferCompletion(sendErrSell);
                        if (!completedSell) {
                            tonOrderSendPending = null;
                            forceDismissTonConnectSendUi();
                            var sendMsgSell = '전송 실패: ' + String(sendErrSell && sendErrSell.message ? sendErrSell.message : sendErrSell);
                            if (tg && typeof tg.showAlert === 'function') tg.showAlert(sendMsgSell);
                            else alert(sendMsgSell);
                            return;
                        }
                        txidSell = 'MANUAL_CONFIRMED_TX';
                        }
                    }
                    forceDismissTonConnectSendUi();
                    tonOrderSendPending = null;
                    receiver.status = 'sell_coin_sent';
                    receiver.sellerSentAt = now;
                    receiver.txid = String(txidSell || 'TESTNET_TX_SENT').trim();
                } else if (action === 'issue') {
                    if (!youAreBuyer0) return;
                    var stIss = String(r0.status || '');
                    if (stIss === 'sell_coin_sent') {
                        var noteSell = prompt('판매자에게 전달할 확인 요청 메시지를 입력해주세요.') || '';
                        receiver.status = 'sell_buyer_issue_coin';
                        receiver.issueNote = String(noteSell || 'USDT 전송 확인 요청');
                        receiver.issueRaisedAt = now;
                    } else if (stIss === 'sell_buyer_pending_coin_ack') {
                        var noteSellP = prompt('판매자에게 추가 확인 요청 메시지를 입력해 주세요.') || '';
                        receiver.status = 'sell_buyer_issue_coin';
                        receiver.issueNote = String(noteSellP || 'USDT 전송 확인 요청');
                        receiver.issueRaisedAt = now;
                    } else {
                        return;
                    }
                } else if (action === 'issue_seller_coin') {
                    // 구매자가 USDT 전송 확인 요청을 보낸 뒤, 판매자가 구매자에게 답장 → 구매자가 「USDT 수령 확인」으로 진행
                    if (!youAreSeller0) return;
                    var stSe = String(r0.status || '');
                    if (stSe !== 'sell_buyer_issue_coin' && stSe !== 'sell_buyer_pending_coin_ack') return;
                    var noteSellerIssue = prompt('구매자에게 전달할 메시지를 입력해 주세요.') || '';
                    receiver.sellerCoinIssueReply = String(noteSellerIssue || '전송 상태를 확인해 주세요.');
                    receiver.sellerCoinIssueReplyAt = now;
                    receiver.status = 'sell_buyer_pending_coin_ack';
                } else if (action === 'buyer_confirm_usdt_received') {
                    // 판매자 답변 후 구매자가 온체인 수령을 확인하고 입금 단계로 복귀
                    if (!youAreBuyer0 || String(r0.status) !== 'sell_buyer_pending_coin_ack') return;
                    receiver.status = 'sell_coin_sent';
                    receiver.buyerUsdtAckAfterSellerReplyAt = now;
                } else if (action === 'paid') {
                    if (!youAreBuyer0) return;
                    if (String(r0.status) === 'sell_coin_sent' || String(r0.status) === 'sell_seller_issue_fiat') {
                        receiver.status = 'sell_fiat_paid';
                        receiver.buyerPaidAt = now;
                        receiver.sellBuyerFiatVerifyRequested = true;
                    } else {
                        return;
                    }
                } else if (action === 'issue_sell_fiat') {
                    if (!youAreSeller0 || String(r0.status) !== 'sell_fiat_paid') return;
                    receiver.status = 'sell_seller_issue_fiat';
                    receiver.sellerFiatIssueAt = now;
                } else if (action === 'confirm') {
                    // 재확인 요청 중(sell_seller_issue_fiat)에는 구매자 처리 전까지 완료 불가
                    if (!youAreSeller0 || String(r0.status) !== 'sell_fiat_paid') return;
                    var okSellConfirm = await openFinalCompleteConfirmPopup();
                    if (!okSellConfirm) return;
                    receiver.status = 'buyer_confirmed';
                    receiver.buyerConfirmedAt = now;
                } else {
                    return;
                }
                receiver.updatedAt = now;
                try {
                    await patchOrderReceiverToSupabase(orderId, receiver);
                    await refreshMyOffers();
                } catch (e) {
                    var msgS = '상태 변경 실패: ' + String(e && e.message ? e.message : e);
                    if (tg && typeof tg.showAlert === 'function') tg.showAlert(msgS);
                    else alert(msgS);
                }
                return;
            }

            if (action === 'approve') {
                receiver.status = 'seller_approved';
                receiver.sellerApprovedAt = now;
                // 판매자 승인 시점에 내 로컬 계좌정보로 정확한 전달값을 보강
                if (!receiver.sellerBankAccountNumber || !receiver.sellerBankAccountHolder) {
                    var banks = loadBankAccounts();
                    var matched = (Array.isArray(banks) ? banks : []).find(function (a) {
                        return String(a.id || '') === String(receiver.sellerBankAccountId || '');
                    });
                    if (matched) {
                        receiver.sellerBankName = String(matched.bank || '');
                        receiver.sellerBankAccountNumber = String(matched.accountNumber || '');
                        receiver.sellerBankAccountHolder = String(matched.accountHolder || '');
                        receiver.sellerBankText = receiver.sellerBankName + ' | ' + receiver.sellerBankAccountNumber + ' | ' + receiver.sellerBankAccountHolder;
                    }
                }
            } else if (action === 'reject') {
                var rrBuy = '';
                try {
                    rrBuy = prompt('거절 사유를 입력해 주세요. (선택)', '') || '';
                } catch (eRjB) {}
                receiver.rejectReason = String(rrBuy || '').trim() || '(사유 미입력)';
                receiver.status = 'seller_rejected';
            } else if (action === 'paid') {
                receiver.status = 'buyer_paid';
                receiver.buyerPaidAt = now;
            } else if (action === 'check_deposit') {
                receiver.status = 'seller_deposit_checked';
                receiver.sellerDepositCheckedAt = now;
            } else if (action === 'request_payment_check') {
                receiver.status = 'seller_payment_check_requested';
                receiver.sellerPaymentCheckRequestedAt = now;
            } else if (action === 'cancel') {
                var cnBuy = '';
                try {
                    cnBuy = prompt('취소 사유를 입력해 주세요. (선택)', '') || '';
                } catch (eCnB) {}
                receiver.cancelNote = String(cnBuy || '').trim() || '(메모 없음)';
                receiver.status = 'buyer_cancelled';
                receiver.buyerCancelledAt = now;
            } else if (action === 'sent') {
                var buyToAddress = String(receiver.receiverWalletAddress || '').trim();
                var txid = '';
                try {
                    if (buyToAddress.indexOf('.....') !== -1) {
                        throw new Error('구매자 지갑 주소가 마스킹되어 전송할 수 없습니다. 원본 주소로 다시 주문해 주세요.');
                    }
                    txid = await sendUsdtJettonOnTestnet(buyToAddress, target.usdt, {
                        orderId: String(orderId),
                        side: 'buy',
                        preSendReceiver: Object.assign({}, receiver)
                    });
                    if (tonOrderSendResolvedByReturn) {
                        tonOrderSendResolvedByReturn = false;
                        tonOrderSendPending = null;
                        forceDismissTonConnectSendUi();
                        return;
                    }
                } catch (sendErrBuy) {
                    if (tonOrderSendResolvedByReturn) {
                        tonOrderSendResolvedByReturn = false;
                        tonOrderSendPending = null;
                        forceDismissTonConnectSendUi();
                        return;
                    }
                    if (isTonTxTimeoutAfterApprovalError(sendErrBuy)) {
                        txid = 'TIMEOUT_AFTER_APPROVAL_ASSUMED_OK';
                    } else if (!shouldOfferManualTransferConfirm(sendErrBuy)) {
                        tonOrderSendPending = null;
                        forceDismissTonConnectSendUi();
                        var preBuy = String(sendErrBuy && sendErrBuy.message ? sendErrBuy.message : sendErrBuy);
                        if (tg && typeof tg.showAlert === 'function') tg.showAlert(preBuy);
                        else alert(preBuy);
                        return;
                    } else {
                    var completedBuy = await confirmManualTransferCompletion(sendErrBuy);
                    if (!completedBuy) {
                        tonOrderSendPending = null;
                        forceDismissTonConnectSendUi();
                        var sendMsgBuy = '전송 실패: ' + String(sendErrBuy && sendErrBuy.message ? sendErrBuy.message : sendErrBuy);
                        if (tg && typeof tg.showAlert === 'function') tg.showAlert(sendMsgBuy);
                        else alert(sendMsgBuy);
                        return;
                    }
                    txid = 'MANUAL_CONFIRMED_TX';
                    }
                }
                forceDismissTonConnectSendUi();
                tonOrderSendPending = null;
                receiver.status = 'seller_sent';
                receiver.sellerSentAt = now;
                receiver.txid = String(txid || 'TESTNET_TX_SENT').trim();
            } else if (action === 'confirm') {
                var okBuyConfirm = await openFinalCompleteConfirmPopup();
                if (!okBuyConfirm) return;
                receiver.status = 'buyer_confirmed';
                receiver.buyerConfirmedAt = now;
            } else if (action === 'issue') {
                var note = prompt('판매자에게 전달할 확인 요청 메시지를 입력해주세요.') || '';
                receiver.status = 'buyer_issue';
                receiver.issueNote = String(note || '입금/전송 상태 확인 요청');
                receiver.issueRaisedAt = now;
            } else {
                return;
            }
            receiver.updatedAt = now;
            try {
                await patchOrderReceiverToSupabase(orderId, receiver);
                await refreshMyOffers();
            } catch (e) {
                var msg = '상태 변경 실패: ' + String(e && e.message ? e.message : e);
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                else alert(msg);
            }
        }

        // 리스팅 상세(모달)
        let listingDetailState = { listingId: null };

        function closeListingDetail() {
            if (!dom.listingDetailView) {
                // dom 객체에 없을 수 있으니 안전 처리
                var el = document.getElementById('listingDetailView');
                if (el) el.classList.add('hidden');
                return;
            }
            dom.listingDetailView.classList.add('hidden');
        }

        function closeListingDetailIfOverlayClicked(event) {
            if (!event) return;
            if (event.target !== event.currentTarget) return;
            closeListingDetail();
        }

        async function openListingDetail(listingId) {
            if (!listingId) return;
            var listings = loadListings();
            var found = (Array.isArray(listings) ? listings : []).find(function (l) {
                return String(l.id) === String(listingId);
            });

            // localStorage에 없으면 서버에서 찾아서 상세 모달 표시
            if (!found) {
                try {
                    var serverListings = await fetchListingsFromSupabase();
                    found = (Array.isArray(serverListings) ? serverListings : []).find(function (l) {
                        return String(l.id) === String(listingId);
                    });
                } catch (e) {}
            }

            if (!found) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('존재하지 않는 리스팅입니다.');
                else alert('존재하지 않는 리스팅입니다.');
                return;
            }

            listingDetailState.listingId = found.id;
            // 모달 재렌더/상태 꼬임 방지를 위해 data 속성에도 저장
            var detailEl = document.getElementById('listingDetailView');
            if (detailEl && detailEl.dataset) detailEl.dataset.listingId = found.id;
            var detailDeleteBtn = document.getElementById('detailDeleteBtn');
            if (detailDeleteBtn && detailDeleteBtn.dataset) detailDeleteBtn.dataset.listingId = found.id;

            var el = document.getElementById('listingDetailView');
            if (el) el.classList.remove('hidden');

            var ownerName = found.ownerName || 'User';
            document.getElementById('detailOwnerName').textContent = ownerName;
            document.getElementById('detailDepositText').textContent = Number(found.depositUsdt || 0).toLocaleString() + ' USDT';
            document.getElementById('detailOrderText').textContent =
                Number(found.orderMinUsdt || 0).toLocaleString() + '~' + Number(found.orderMaxUsdt || 0).toLocaleString() + ' USDT';
            document.getElementById('detailBoostText').textContent = Number(found.boostUsdt || 0).toLocaleString() + ' USDT';

            // 모드/가격 라인 토글
            var sellLine = document.getElementById('detailSellPriceLine');
            var buyLine = document.getElementById('detailBuyPriceLine');
            var sellTitle = document.getElementById('detailSellTitle');
            var buyTitle = document.getElementById('detailBuyTitle');

            var detailSellModeOn = parseModeFlag(found && found.sellMode);
            var detailBuyModeOn = parseModeFlag(found && found.buyMode);

            if (detailSellModeOn) {
                if (sellLine) sellLine.style.display = 'flex';
                if (sellTitle) sellTitle.style.display = 'block';
                var sp = found.sellPriceKrW != null ? formatKrw(found.sellPriceKrW) : '—';
                var sm = Number(found.sellMarginPct != null ? found.sellMarginPct : 0);
                if (Number.isFinite(sm) && dom && dom.listingSellMarginInput) sp += ' · ' + sm.toFixed(1) + '%';
                document.getElementById('detailSellPriceText').textContent = sp;
            } else {
                if (sellLine) sellLine.style.display = 'none';
                if (sellTitle) sellTitle.style.display = 'none';
            }

            if (detailBuyModeOn) {
                if (buyLine) buyLine.style.display = 'flex';
                if (buyTitle) buyTitle.style.display = 'block';
                var bp = found.buyPriceKrW != null ? formatKrw(found.buyPriceKrW) : '—';
                var bm = Number(found.buyMarginPct != null ? found.buyMarginPct : 0);
                if (Number.isFinite(bm) && dom && dom.listingBuyMarginInput) bp += ' · ' + bm.toFixed(1) + '%';
                document.getElementById('detailBuyPriceText').textContent = bp;
            } else {
                if (buyLine) buyLine.style.display = 'none';
                if (buyTitle) buyTitle.style.display = 'none';
            }

            // 소유자 액션 표시
            var isOwner = String(found.ownerId) === String(currentUserId);
            var ownerActionsEl = document.getElementById('detailOwnerActions');
            if (ownerActionsEl) ownerActionsEl.classList.toggle('hidden', !isOwner);

            // 본인 리스팅 상세에서는 거래요청 버튼 숨김(수정/삭제만 노출)
            var makeOfferBtn = document.getElementById('detailMakeOfferBtn');
            if (makeOfferBtn) {
                var canRequest = detailSellModeOn || detailBuyModeOn;
                var detailPreferredSide = detailSellModeOn ? 'buy' : 'sell';
                makeOfferBtn.classList.toggle('hidden', !!isOwner || !canRequest);
                if (canRequest) {
                    makeOfferBtn.setAttribute('onclick', "openOrderFlow(listingDetailState.listingId, '" + detailPreferredSide + "')");
                }
            }
        }

        function openListingEditFromDetail() {
            var listingId = listingDetailState && listingDetailState.listingId ? listingDetailState.listingId : null;
            if (!listingId) {
                var detailEl = document.getElementById('listingDetailView');
                listingId = detailEl && detailEl.dataset ? detailEl.dataset.listingId : null;
            }
            if (!listingId) {
                var msg = '수정할 리스팅을 찾지 못했습니다. 다시 열어 주세요.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                else alert(msg);
                return;
            }
            closeListingDetail();
            openListingEdit(listingId);
        }

        function deleteListingFromDetail() {
            var listingId = listingDetailState && listingDetailState.listingId ? listingDetailState.listingId : null;
            var deleteBtnEl = document.getElementById('detailDeleteBtn');
            if (!listingId && deleteBtnEl && deleteBtnEl.dataset) listingId = deleteBtnEl.dataset.listingId || null;
            if (!listingId) {
                var detailEl = document.getElementById('listingDetailView');
                listingId = detailEl && detailEl.dataset ? detailEl.dataset.listingId : null;
            }
            // deleteListing은 async이므로 실패 시에도 사용자에게 표시
            try {
                var p = deleteListing(listingId, true);
                if (p && typeof p.catch === 'function') {
                    p.catch(function (e) {
                        var msg = '삭제 오류: ' + (e && e.message ? e.message : String(e));
                        if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
                        else alert(msg);
                    });
                }
            } catch (e2) {
                var msg2 = '삭제 오류: ' + (e2 && e2.message ? e2.message : String(e2));
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg2);
                else alert(msg2);
            }
        }

        function confirmDeleteAsync(message) {
            return new Promise(function (resolve) {
                try {
                    // 텔레그램 WebApp 환경에서는 네이티브 confirm 대신 showConfirm 사용
                    if (tg && typeof tg.showConfirm === 'function') {
                        tg.showConfirm(String(message || ''), function (ok) {
                            resolve(!!ok);
                        });
                        return;
                    }
                } catch (e) {}

                try {
                    var ok = window.confirm(String(message || '삭제할까요?'));
                    resolve(!!ok);
                } catch (e2) {
                    resolve(false);
                }
            });
        }

        async function deleteListing(listingId, skipConfirm) {
            if (!listingId) {
                // fallback: 모달/상태에서 ID를 못 찾으면 내 최신 리스팅을 서버에서 찾아 삭제 시도
                try {
                    var all = await fetchListingsFromSupabase();
                    var mine = (Array.isArray(all) ? all : [])
                        .filter(function (x) { return String(x.ownerId) === String(currentUserId); })
                        .sort(function (a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0); });
                    if (mine.length > 0) listingId = mine[0].id;
                } catch (e) {}
            }
            if (!listingId) {
                var missMsg0 = '삭제할 리스팅 ID를 찾지 못했습니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(missMsg0);
                else alert(missMsg0);
                return;
            }
            var listings = loadListings();
            var idx = (Array.isArray(listings) ? listings : []).findIndex(function (l) {
                return String(l.id) === String(listingId);
            });

            var found = idx >= 0 ? listings[idx] : null;

            // localStorage에 없으면 서버에서 찾아서 삭제 권한 판단
            if (!found) {
                try {
                    var serverListings2 = await fetchListingsFromSupabase();
                    found = (Array.isArray(serverListings2) ? serverListings2 : []).find(function (l) {
                        return String(l.id) === String(listingId);
                    });
                } catch (e) {}
            }

            if (!found) {
                var missMsg = '삭제 대상 리스팅을 찾지 못했습니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(missMsg);
                else alert(missMsg);
                return;
            }

            // 소유자 판정 보강: ownerId 우선, 보조로 ownerName까지 확인(텔레그램 user binding 이슈 대비)
            var isOwnerById = String(found.ownerId) === String(currentUserId);
            var isOwnerByName = String(found.ownerName || '') === String(currentUserName || '');
            if (!isOwnerById && !isOwnerByName) {
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('본인의 리스팅만 삭제할 수 있습니다.');
                else alert('본인의 리스팅만 삭제할 수 있습니다.');
                return;
            }

            // 텔레그램 웹뷰에서 confirm이 막히는 이슈가 있어 상세 모달 버튼은 즉시 삭제 모드로 실행
            if (!skipConfirm) {
                var ok = await confirmDeleteAsync('이 리스팅을 삭제할까요?');
                if (!ok) return;
            }

            // 1) 서버에서 삭제 시도
            var serverDeleted = false;
            var serverDeleteErr = '';
            try {
                    await deleteListingFromSupabase(listingId);
                    // 실제 삭제 검증: 동일 ID가 남아 있으면 실패로 처리
                    var stillExists = await listingExistsInSupabase(listingId);
                    serverDeleted = !stillExists;
                    if (stillExists) serverDeleteErr = 'supabase row still exists';
            } catch (e) {
                serverDeleted = false;
                serverDeleteErr = String(e && e.message ? e.message : e);
            }

            // 2) 서버 삭제 성공이면 목록만 갱신
            if (serverDeleted) {
                    // 로컬 캐시도 함께 제거해 화면 잔상 방지
                    if (idx >= 0) {
                        listings.splice(idx, 1);
                        saveListings(listings);
                    }
                closeListingDetail();
                loadMarketplace();
                if (tg && typeof tg.showAlert === 'function') tg.showAlert('리스팅이 삭제되었습니다.');
                else alert('리스팅이 삭제되었습니다.');
                return;
            }

            // 3) 서버 실패면 기존 로컬 삭제 fallback
            if (idx >= 0) {
                listings.splice(idx, 1);
                saveListings(listings);
                closeListingDetail();
                loadMarketplace();
                var fbMsg = '서버 삭제 실패로 로컬에서만 삭제되었습니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(fbMsg);
                else alert(fbMsg);
                return;
            }

            // 서버/로컬 모두 실패 시 사용자에게 이유를 명확히 표시
            var failMsg = '삭제 실패: 서버 응답을 확인해 주세요.' + (serverDeleteErr ? (' (' + serverDeleteErr + ')') : '');
            if (tg && typeof tg.showAlert === 'function') tg.showAlert(failMsg);
            else alert(failMsg);
        }

        function shortenAddress(address) {
            const s = String(address || '');
            if (s.length <= 12) return s;
            return s.slice(0, 6) + '...' + s.slice(-6);
        }

        function maskAccountNumber(accountNumber) {
            const s = String(accountNumber || '');
            if (s.length <= 6) return '•••';
            return s.slice(0, 2) + '•••' + s.slice(-4);
        }

        function loadTonWallets() {
            let wallets = safeParseJson(localStorage.getItem(STORAGE.TON_WALLETS) || '[]', []);
            if (wallets.length === 0) {
                const legacy = safeParseJson(localStorage.getItem(STORAGE.LEGACY_DEFAULT_TON_WALLET) || 'null', null);
                if (legacy && legacy.address) {
                    wallets = [{
                        address: legacy.address,
                        label: legacy.label || 'TON Wallet',
                        network: 'TON',
                        updatedAt: legacy.updatedAt || Date.now()
                    }];
                }
            }
            return wallets;
        }

        function getDefaultTonWalletAddress() {
            const direct = localStorage.getItem(STORAGE.DEFAULT_TON_WALLET_ADDRESS);
            if (direct) return direct;

            const legacy = safeParseJson(localStorage.getItem(STORAGE.LEGACY_DEFAULT_TON_WALLET) || 'null', null);
            if (legacy && legacy.address) return legacy.address;
            return null;
        }

        function setDefaultTonWalletAddress(address) {
            if (!address) return;
            const wallets = loadTonWallets();
            const found = wallets.find(w => w.address === address);

            localStorage.setItem(STORAGE.DEFAULT_TON_WALLET_ADDRESS, address);
            // Legacy value (so older UI/logic won't break)
            try {
                localStorage.setItem(
                    STORAGE.LEGACY_DEFAULT_TON_WALLET,
                    JSON.stringify({ address, label: found && found.label ? found.label : 'TON Wallet', updatedAt: Date.now() })
                );
            } catch (e) {
                // ignore
            }

            // CloudStorage에도 저장(동기화)
            cloudSetItem(STORAGE.DEFAULT_TON_WALLET_ADDRESS, address);
            if (found && found.label) {
                cloudSetItem(
                    STORAGE.LEGACY_DEFAULT_TON_WALLET,
                    JSON.stringify({ address, label: found.label, updatedAt: Date.now() })
                );
            } else {
                cloudSetItem(
                    STORAGE.LEGACY_DEFAULT_TON_WALLET,
                    JSON.stringify({ address, label: 'TON Wallet', updatedAt: Date.now() })
                );
            }

            renderSavedWallets();
            refreshMyPageUsdtBalance();
        }

        function deleteTonWallet(address) {
            if (!address) return;
            const ok = window.confirm('Delete this TON wallet?');
            if (!ok) return;

            const wallets = loadTonWallets();
            const next = wallets.filter(w => w.address !== address);

            try {
                localStorage.setItem(STORAGE.TON_WALLETS, JSON.stringify(next));
            } catch (e) {
                // 저장 실패 시에도 UI는 일단 갱신하지 않음
                alert('Failed to delete.');
                return;
            }

            cloudSetItem(STORAGE.TON_WALLETS, JSON.stringify(next));

            // If the deleted wallet was default, clear default
            const currentDefault = getDefaultTonWalletAddress();
            if (currentDefault && currentDefault === address) {
                localStorage.removeItem(STORAGE.DEFAULT_TON_WALLET_ADDRESS);
                localStorage.removeItem(STORAGE.LEGACY_DEFAULT_TON_WALLET);
                cloudRemoveItems([STORAGE.DEFAULT_TON_WALLET_ADDRESS, STORAGE.LEGACY_DEFAULT_TON_WALLET]);
            }

            renderSavedWallets();
            refreshMyPageUsdtBalance();
        }

        function renderSavedWallets() {
            const wallets = loadTonWallets();
            const defaultAddress = getDefaultTonWalletAddress();

            if (dom.savedWalletsCount) dom.savedWalletsCount.innerText = '(' + wallets.length + ')';

            if (!dom.tonWalletCards) return;
            if (!wallets.length) {
                dom.tonWalletCards.innerHTML = "<div style='color:#888; padding: 18px 0;'>No wallets saved.</div>";
                return;
            }

            dom.tonWalletCards.innerHTML = wallets.map((w, idx) => {
                const label = w.label || 'TON Wallet';
                const shortAddr = shortenAddress(w.address);
                const isDefault = w.address === defaultAddress;
                const addrForJs = escapeJsString(w.address);

                return `
                    <div class="saved-card" onclick="editTonWallet('${addrForJs}')">
                        <div class="saved-card-top">
                            <div class="saved-card-main">
                                <div class="saved-wallet-title">${escapeHtml(label)}</div>
                                <div class="saved-network-badge">TON</div>
                                <div class="saved-address">${escapeHtml(shortAddr)}</div>
                            </div>
                            <div class="saved-card-col-right">
                                <div class="saved-card-actions-row">
                                    <button class="star-btn ${isDefault ? 'on' : ''}" onclick="event.stopPropagation(); setDefaultTonWalletAddress('${addrForJs}')">
                                        ${isDefault ? '★' : '☆'}
                                    </button>
                                    <button class="delete-wallet-btn" onclick="event.stopPropagation(); deleteTonWallet('${addrForJs}')">Delete</button>
                                </div>
                                <div class="saved-wallet-usdt-block" id="savedWalletUsdt_${idx}">
                                    <div class="saved-wallet-usdt-label">보유 USDT</div>
                                    <div class="saved-wallet-usdt-value">조회 중…</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            wallets.forEach(function (w, idx) {
                var row = document.getElementById('savedWalletUsdt_' + idx);
                var valEl = row ? row.querySelector('.saved-wallet-usdt-value') : null;
                if (!valEl) return;
                fetchJettonUsdtBalance(w.address)
                    .then(function (n) {
                        if (n === null) {
                            valEl.textContent = '조회 실패';
                            return;
                        }
                        valEl.textContent = Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' USDT';
                    })
                    .catch(function () {
                        valEl.textContent = '조회 실패';
                    });
            });
        }

        function loadBankAccounts() {
            return safeParseJson(localStorage.getItem(STORAGE.BANK_ACCOUNTS) || '[]', []);
        }

        function setDefaultBankAccount(id) {
            if (!id) return;
            localStorage.setItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID, id);
            cloudSetItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID, id);
            renderSavedBankAccounts();
        }

        function deleteBankAccount(id) {
            if (!id) return;
            const ok = window.confirm('Delete this bank account?');
            if (!ok) return;

            const accounts = loadBankAccounts();
            const next = accounts.filter(a => String(a.id) !== String(id));

            try {
                localStorage.setItem(STORAGE.BANK_ACCOUNTS, JSON.stringify(next));
            } catch (e) {
                alert('Failed to delete.');
                return;
            }

            const defaultId = localStorage.getItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);
            if (defaultId && String(defaultId) === String(id)) {
                localStorage.removeItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);
            }

            cloudSetItem(STORAGE.BANK_ACCOUNTS, JSON.stringify(next));
            if (defaultId && String(defaultId) === String(id)) {
                cloudRemoveItems([STORAGE.DEFAULT_BANK_ACCOUNT_ID]);
            }

            renderSavedBankAccounts();
        }

        function renderSavedBankAccounts() {
            const accounts = loadBankAccounts();
            const defaultId = localStorage.getItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);

            if (dom.savedBankAccountsCount) dom.savedBankAccountsCount.innerText = '(' + accounts.length + ')';
            if (!dom.bankAccountCards) return;

            if (!accounts.length) {
                dom.bankAccountCards.innerHTML = "<div style='color:#888; padding: 18px 0;'>No bank accounts saved.</div>";
                return;
            }

            dom.bankAccountCards.innerHTML = accounts.map(a => {
                const label = a.label || 'Bank Account';
                const bank = a.bank || 'Bank';
                const masked = maskAccountNumber(a.accountNumber);
                const holder = a.accountHolder || '';
                const isDefault = String(a.id) === String(defaultId);
                const idForJs = escapeJsString(a.id);

                return `
                    <div class="saved-card" onclick="editBankAccount('${idForJs}')">
                        <div class="saved-card-top">
                            <div>
                                <div class="saved-wallet-title">${escapeHtml(label)}</div>
                                <div class="saved-network-badge">${escapeHtml(bank)}</div>
                                <div class="saved-address">Account: ${escapeHtml(masked)}</div>
                                <div class="saved-address" style="margin-top: 6px;">${escapeHtml(holder)}</div>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button class="star-btn ${isDefault ? 'on' : ''}" onclick="event.stopPropagation(); setDefaultBankAccount('${idForJs}')">
                                    ${isDefault ? '★' : '☆'}
                                </button>
                                <button class="delete-wallet-btn" onclick="event.stopPropagation(); deleteBankAccount('${idForJs}')">Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function toggleAccordion(kind) {
            if (kind === 'wallets') {
                if (!dom.walletsAccordionContent) return;
                const willHide = dom.walletsAccordionContent.classList.toggle('hidden');
                if (dom.walletsChevron) dom.walletsChevron.innerText = willHide ? '˅' : '˄';
                return;
            }
            if (kind === 'banks') {
                if (!dom.banksAccordionContent) return;
                const willHide = dom.banksAccordionContent.classList.toggle('hidden');
                if (dom.banksChevron) dom.banksChevron.innerText = willHide ? '˅' : '˄';
                return;
            }
        }

        function closeIfOverlayClicked(event) {
            if (!event) return;
            if (event.target !== event.currentTarget) return;
            showMyPageSettingsMain();
        }

        // --------------------------------------------------------
        // TonConnect (TON wallet connect modal + connection status)
        let tonConnectUIInstance = null;
        /** iOS Telegram 원클릭 연결용 Tonkeeper 소스 캐시 */
        let tonkeeperSourceForIos = null;
        /** 수동 복귀 시 연결 복원 훅 중복 방지 */
        let tonRestoreHooksBound = false;
        /** 전송 서명 대기 중 브리지 복구 재시도 타이머(지연 복귀 시 한 번만 restore 하면 Open Wallet에 멈추는 경우 완화) */
        let tonRestoreWhileSendTimers = [];
        /** 매니페스트 생성 방식이 바뀌면 TonConnect 인스턴스를 한 번 재생성 */
        const TONCONNECT_MANIFEST_GENERATION = '2026-03-28-https-manifest-v17';
        /** TON Connect 버튼을 눌렀을 때만 주소 자동 입력을 허용 */
        let tonAddressAutofillArmed = false;
        /** TonConnect UI 공식 ko 로케일 없음 → 위젯 DOM 영문만 한글로 치환(연결/전송 로직 비침해) */
        let tonConnectKoObserverInstalled = false;
        let tonConnectKoTimer = null;
        let tonConnectKoBodyObserver = null;

        function updateTonWalletStatusText(nextText) {
            if (dom.tonWalletStatusText) dom.tonWalletStatusText.innerText = nextText;
        }

        // TonConnect 계정 주소를 Tonkeeper 표기와 맞추기 위해 user-friendly(URL-safe) 형식으로 정규화합니다. (보관본과 동일)
        function getTonAddressFromAccount(account) {
            if (!account) return '';
            var raw = '';
            var chain = '';
            if (typeof account === 'string') {
                raw = account;
            } else if (typeof account === 'object') {
                if (typeof account.address === 'string') raw = account.address;
                else if (typeof account.accountAddress === 'string') raw = account.accountAddress;
                else if (typeof account.publicAddress === 'string') raw = account.publicAddress;
                chain = typeof account.chain === 'string' ? account.chain : '';
            }
            raw = String(raw || '').trim();
            if (!raw) return '';

            // TonWeb가 없거나 파싱 실패하면 원본을 유지합니다.
            if (!window.TonWeb || !window.TonWeb.utils || !window.TonWeb.utils.Address) return raw;
            try {
                var isTestnet = String(chain || '') === '-3';
                // user-friendly + url-safe + non-bounceable + testnet 플래그 반영
                return new window.TonWeb.utils.Address(raw).toString(true, true, false, isTestnet);
            } catch (e) {
                return raw;
            }
        }

        /**
         * UI.account만 비고 connector 쪽에만 account가 있는 경우 대비(SDK 동작).
         * 보관본 단순 로직은 유지하되 주소·체인 읽기 경로만 통일.
         */
        function getTonConnectAccountSnapshot() {
            if (!tonConnectUIInstance) return null;
            try {
                if (tonConnectUIInstance.account) return tonConnectUIInstance.account;
            } catch (e0) {}
            // @tonconnect/ui 일부 상태에서 UI 인스턴스의 wallet.account만 채워지는 경우
            try {
                if (tonConnectUIInstance.wallet && tonConnectUIInstance.wallet.account) {
                    return tonConnectUIInstance.wallet.account;
                }
            } catch (eW) {}
            try {
                var c = tonConnectUIInstance.connector;
                if (c && c.account) return c.account;
                if (c && c.wallet && c.wallet.account) return c.wallet.account;
            } catch (e1) {}
            return null;
        }

        /** 마이페이지 요약: 등록된 모든 지갑의 USDT 잔액 합계 */
        function refreshMyPageUsdtBalance() {
            var el = dom.mypageUsdtBalance || document.getElementById('mypageUsdtBalance');
            if (!el) return;
            var wallets = loadTonWallets();
            if (!wallets.length) {
                el.textContent = '저장된 지갑 없음';
                return;
            }
            el.textContent = '조회 중…';
            Promise.all(
                wallets.map(function (w) {
                    return fetchJettonUsdtBalance(w.address)
                        .then(function (n) {
                            return { ok: true, n: n === null ? 0 : Number(n) };
                        })
                        .catch(function () {
                            return { ok: false, n: 0 };
                        });
                })
            ).then(function (parts) {
                var anyOk = parts.some(function (p) { return p.ok; });
                var anyFail = parts.some(function (p) { return !p.ok; });
                var total = parts.reduce(function (s, p) { return s + (Number.isFinite(p.n) ? p.n : 0); }, 0);
                if (!anyOk) {
                    el.textContent = '조회 실패';
                    return;
                }
                var txt = Number(total).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' USDT';
                if (anyFail) txt += ' (일부)';
                el.textContent = txt;
            });
        }

        function refreshMyPageSummary() {
            updateMyPageKycUi();
            refreshMyPageUsdtBalance();
        }

        /**
         * TonConnect 매니페스트는 지갑 앱이 HTTPS로 직접 가져가 검증합니다.
         * data:/blob: URL은 Tonkeeper 쪽에서 열 수 없어 "앱은 열리는데 전송 화면이 비는" 원인이 될 수 있음.
         * 항상 배포된 origin의 tonconnect-manifest.json 전체 URL을 씁니다.
         * (json 안의 "url" 필드도 실제 사이트 주소와 맞춰야 하며, 호스트가 바뀌면 tonconnect-manifest.json을 수정하세요.)
         */
        function buildTonConnectManifestUrl() {
            return new URL('tonconnect-manifest.json', window.location.href).toString();
        }

        /**
         * TonConnect UI(@tonconnect/ui)는 en/ru만 공식 지원 → 한글 안내는 DOM 텍스트 치환으로 제공.
         * SDK 업데이트 시 문구가 바뀌면 아래 목록만 보강하면 됨.
         */
        function translateTonConnectTextToKo(s) {
            if (!s || typeof s !== 'string') return s;
            var out = s;
            // 동적 문구(지갑 이름 삽입) — 공백에 NBSP(\u00A0)가 섞여도 매칭
            out = out.replace(
                /Open[\s\u00A0]+([^.\n]+?)[\s\u00A0]+to[\s\u00A0]+confirm[\s\u00A0]+the[\s\u00A0]+transaction\.?/gi,
                function (_, name) {
                    return String(name).trim() + '에서 거래를 확인해 주세요.';
                }
            );
            out = out.replace(
                /Confirm[\s\u00A0]+the[\s\u00A0]+transaction[\s\u00A0]+in[\s\u00A0]+([^.\n]+?)\.[\s\u00A0]*It[\s\u00A0]+will[\s\u00A0]+only[\s\u00A0]+take[\s\u00A0]+a[\s\u00A0]+moment\.?/gi,
                function (_, name) {
                    return String(name).trim() + '에서 거래를 확인해 주세요. 잠시만 걸립니다.';
                }
            );
            out = out.replace(
                /Sign[\s\u00A0]+the[\s\u00A0]+data[\s\u00A0]+in[\s\u00A0]+([^.\n]+?)\.[\s\u00A0]*It[\s\u00A0]+will[\s\u00A0]+only[\s\u00A0]+take[\s\u00A0]+a[\s\u00A0]+moment\.?/gi,
                function (_, name) {
                    return String(name).trim() + '에서 데이터를 서명해 주세요. 잠시만 걸립니다.';
                }
            );
            out = out.replace(
                /Confirm[\s\u00A0]+operation[\s\u00A0]+in[\s\u00A0]+your[\s\u00A0]+wallet/gi,
                '지갑에서 작업을 확인해 주세요'
            );
            out = out.replace(
                /Scan[\s\u00A0]+the[\s\u00A0]+QR[\s\u00A0]+code[\s\u00A0]+below[\s\u00A0]+with[\s\u00A0]+your[\s\u00A0]+phone[\u2019']s[\s\u00A0]+or[\s\u00A0]+(.+?)[\u2019']s[\s\u00A0]+camera/gi,
                function (_, name) {
                    return '아래 QR 코드를 휴대폰이나 ' + String(name).trim() + ' 카메라로 스캔하세요';
                }
            );
            out = out.replace(
                /Continue[\s\u00A0]+in[\s\u00A0]+([^…\n]+?)…/gi,
                function (_, name) {
                    return String(name).trim() + '에서 계속…';
                }
            );
            // 정적 문구(en.json 기준) — 긴 문자열을 먼저 치환(부분 일치 방지)
            var staticPairs = [
                ['Manage your digital identity and access decentralized applications with ease. Maintain control over your data and engage securely in the blockchain ecosystem.', '디지털 신원을 관리하고 탈중앙 앱에 접속하세요. 데이터는 본인이 통제하고 블록체인에서 안전하게 이용하세요.'],
                ['A wallet protects and manages your digital assets including TON, tokens and collectables.', '지갑은 TON·토큰·NFT 등 디지털 자산을 보호·관리합니다.'],
                ['Easily send, receive, monitor your cryptocurrencies. Streamline your operations with decentralized applications.', '암호화폐를 보내고 받고 확인하세요. 탈중앙 앱과 함께 이용 흐름을 단순하게 만듭니다.'],
                ['The wallets below don’t support all features of the connected service. You can use your recovery phrase in one of the supported wallets above.', '아래 지갑은 연결된 서비스의 일부 기능을 지원하지 않을 수 있습니다. 위 목록의 지원 지갑에서 복구 문구로 복원한 뒤 연결해 보세요.'],
                ['Enter the recovery phrase to access your wallet', '복구 문구를 입력해 지갑에 접속하세요'],
                ['Open your wallet settings and locate the recovery phrase', '지갑 설정에서 복구 문구(시드)를 찾아 주세요'],
                ['Write it down or copy it to a safe place', '종이에 적거나 안전한 곳에 복사해 보관하세요'],
                ['Find your current recovery phrase', '현재 복구 문구를 확인하세요'],
                ['Copy your recovery phrase', '복구 문구를 복사하세요'],
                ['Restore in a supported wallet', '지원 지갑에서 복구하세요'],
                ['Your transaction will be processed in a few seconds.', '잠시 후 거래가 처리됩니다.'],
                ['There will be no changes to your account.', '계정에는 변경이 반영되지 않습니다.'],
                ['Use Wallet in Telegram or choose other application', '텔레그램 지갑을 쓰거나 다른 앱을 선택하세요'],
                ['Connect Wallet in Telegram on desktop', '데스크톱 텔레그램에서 지갑 연결'],
                ['Connect Wallet in Telegram', '텔레그램에서 지갑 연결'],
                ['Choose other application', '다른 앱 선택'],
                ['Scan with your mobile wallet', '모바일 지갑으로 스캔하세요'],
                ['Connect your TON wallet', 'TON 지갑을 연결하세요'],
                ['Connect your TON\u00A0wallet', 'TON 지갑을 연결하세요'],
                ['Available wallets', '사용 가능한 지갑'],
                ['Confirm Disconnect', '연결 해제 확인'],
                ['your version does not support required features for this dApp', '이 미니앱에 필요한 기능을 지원하지 않는 버전입니다'],
                ['Wallet in', '지갑:'],
                ['Transaction sent', '거래가 전송되었습니다'],
                ['Transaction canceled', '거래가 취소되었습니다'],
                ['Data signed', '데이터가 서명되었습니다'],
                ['Sign data canceled', '데이터 서명이 취소되었습니다'],
                ['What is a wallet', '지갑이란?'],
                ['Secure digital assets storage', '디지털 자산을 안전하게 보관'],
                ['Control your Web3 identity', 'Web3 신원을 직접 관리'],
                ['Effortless crypto transactions', '간편한 암호화폐 거래'],
                ['Get a Wallet', '지갑 받기'],
                ['Loading wallets', '지갑 목록 불러오는 중…'],
                ['Open Link', '링크 열기'],
                ['Copy Link', '링크 복사'],
                ['Link Copied', '링크가 복사됨'],
                ['Address copied!', '주소가 복사되었습니다!'],
                ['Copy address', '주소 복사'],
                ['Browser Extension', '브라우저 확장'],
                ['Open wallet', '지갑 열기'],
                ['Connect Wallet', '지갑 연결'],
                ['Disconnect', '연결 해제'],
                ['Copied', '복사됨'],
                ['Your Wallet', '내 지갑'],
                ['Retry', '다시 시도'],
                ['Mobile', '모바일'],
                ['Desktop', '데스크톱'],
                ['Close', '닫기'],
                ['Popular', '인기'],
                ['Installed', '설치됨'],
                ['Recent', '최근'],
                ['Wallets', '지갑'],
                ['Restore', '복구'],
                ['GET', 'GET']
            ];
            var p;
            for (p = 0; p < staticPairs.length; p++) {
                if (out.indexOf(staticPairs[p][0]) !== -1) {
                    out = out.split(staticPairs[p][0]).join(staticPairs[p][1]);
                }
            }
            return out;
        }

        function applyTonConnectKoToDom(root) {
            if (!root) return;
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            var nodes = [];
            var n;
            while ((n = walker.nextNode())) {
                nodes.push(n);
            }
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var t = node.nodeValue;
                if (!t || !String(t).trim()) continue;
                var next = translateTonConnectTextToKo(t);
                if (next !== t) node.nodeValue = next;
            }
        }

        function scheduleTonConnectKoApply() {
            if (tonConnectKoTimer) {
                try {
                    clearTimeout(tonConnectKoTimer);
                } catch (eClr) {}
            }
            tonConnectKoTimer = setTimeout(function () {
                tonConnectKoTimer = null;
                var root = document.getElementById('tc-widget-root');
                if (root) {
                    try {
                        applyTonConnectKoToDom(root);
                    } catch (eApply) {}
                }
                try {
                    requestAnimationFrame(function () {
                        var r2 = document.getElementById('tc-widget-root');
                        if (r2) applyTonConnectKoToDom(r2);
                    });
                } catch (eRaf) {}
            }, 0);
        }

        function installTonConnectUiKoreanOverlay() {
            if (tonConnectKoObserverInstalled) return;
            tonConnectKoObserverInstalled = true;
            function bindWidgetObserver() {
                var root = document.getElementById('tc-widget-root');
                if (!root) return false;
                try {
                    var mo = new MutationObserver(function () {
                        scheduleTonConnectKoApply();
                    });
                    mo.observe(root, { subtree: true, childList: true, characterData: true });
                } catch (eMo) {}
                scheduleTonConnectKoApply();
                return true;
            }
            if (!bindWidgetObserver()) {
                tonConnectKoBodyObserver = new MutationObserver(function () {
                    if (bindWidgetObserver() && tonConnectKoBodyObserver) {
                        try {
                            tonConnectKoBodyObserver.disconnect();
                        } catch (eDisc) {}
                        tonConnectKoBodyObserver = null;
                    }
                });
                try {
                    tonConnectKoBodyObserver.observe(document.body, { childList: true, subtree: true });
                } catch (eBody) {}
            }
            if (tonConnectUIInstance && typeof tonConnectUIInstance.onModalStateChange === 'function') {
                try {
                    tonConnectUIInstance.onModalStateChange(function () {
                        scheduleTonConnectKoApply();
                    });
                } catch (eModal) {}
            }
            scheduleTonConnectKoApply();
        }

        function initTonConnectUIIfNeeded() {
            try {
                if (sessionStorage.getItem('tonManifestGen') !== TONCONNECT_MANIFEST_GENERATION) {
                    if (tonConnectUIInstance && typeof tonConnectUIInstance.disconnect === 'function') {
                        try {
                            tonConnectUIInstance.disconnect();
                        } catch (eDiscOld) {}
                    }
                    tonConnectUIInstance = null;
                    tonConnectKoObserverInstalled = false;
                    if (tonConnectKoBodyObserver) {
                        try {
                            tonConnectKoBodyObserver.disconnect();
                        } catch (eKoDisc) {}
                        tonConnectKoBodyObserver = null;
                    }
                    sessionStorage.setItem('tonManifestGen', TONCONNECT_MANIFEST_GENERATION);
                }
            } catch (eGen) {}
            if (tonConnectUIInstance) return;

            // Stop if TonConnect UI failed to load (or CDN blocked)
            if (!window.TON_CONNECT_UI || !window.TON_CONNECT_UI.TonConnectUI) {
                if (dom.tonConnectFallback) dom.tonConnectFallback.classList.remove('hidden');
                updateTonWalletStatusText('Failed to load TON Connect library.');
                return;
            }

            var manifestUrl = buildTonConnectManifestUrl();
            // twaReturnUrl: TWA 지갑(Wallet on Telegram)용 — https://t.me/ 형식 유지
            var runtimeTwaReturnUrl = TON_TWA_RETURN_URL;

            try {
                tonConnectUIInstance = new window.TON_CONNECT_UI.TonConnectUI({
                    manifestUrl: manifestUrl,
                    buttonRootId: 'tonConnectButtonRoot',
                    language: 'en',
                    actionsConfiguration: {
                        // returnStrategy: Tonkeeper(독립 앱)가 서명 완료 후 열어야 할 복귀 딥링크
                        // tg://resolve?domain=봇이름 형식이 https://t.me/ 보다 신뢰도 높음(브라우저 우회 없음)
                        returnStrategy: TON_RETURN_TG_DEEPLINK,
                        // twaReturnUrl: Wallet on Telegram 같은 TWA 지갑 사용 시 복귀 URL
                        twaReturnUrl: runtimeTwaReturnUrl
                    }
                });
                // SDK는 en/ru만 공식 지원 → 위젯 DOM을 한글로 치환(아래 오버레이)
                installTonConnectUiKoreanOverlay();
                // iOS에서는 모달 2차 클릭이 막히는 케이스가 있어 Tonkeeper 연결 소스를 미리 캐시
                if (typeof tonConnectUIInstance.getWallets === 'function') {
                    tonConnectUIInstance.getWallets()
                        .then(function (wallets) {
                            var tonkeeper = (wallets || []).find(function (w) {
                                return (
                                    w &&
                                    String(w.appName || '').toLowerCase() === 'tonkeeper' &&
                                    typeof w.universalLink === 'string' &&
                                    !!String(w.universalLink).trim() &&
                                    typeof w.bridgeUrl === 'string' &&
                                    !!String(w.bridgeUrl).trim()
                                );
                            });
                            tonkeeperSourceForIos = tonkeeper
                                ? { universalLink: tonkeeper.universalLink, bridgeUrl: tonkeeper.bridgeUrl }
                                : {
                                    // 캐시 실패 시 사용할 Tonkeeper 기본 엔드포인트
                                    universalLink: 'https://app.tonkeeper.com/ton-connect',
                                    bridgeUrl: 'https://bridge.tonapi.io/bridge'
                                };
                        })
                        .catch(function () {
                            tonkeeperSourceForIos = {
                                universalLink: 'https://app.tonkeeper.com/ton-connect',
                                bridgeUrl: 'https://bridge.tonapi.io/bridge'
                            };
                        });
                }
                // iOS 자동 복귀 실패 대비: 사용자가 텔레그램으로 수동 복귀하면 연결 상태 즉시 복원
                if (!tonRestoreHooksBound) {
                    tonRestoreHooksBound = true;
                    document.addEventListener('visibilitychange', function () {
                        // 전송 중 WebView가 hidden이 되면(톤키퍼로 전환) 절대 closeModal 등 SDK 닫기를 호출하지 말 것.
                        // 호출 시 TonConnect가 서명을 '취소'로 처리해 복귀 후 "Transaction canceled" 토스트가 뜸(거래는 성공했는데도).
                        if (document.visibilityState === 'hidden' && tonSendTransactionInFlight) {
                            return;
                        }
                        if (document.visibilityState === 'visible') {
                            // 톤키퍼 전송 후 텔레그램 복귀: Open Wallet 모달 닫기 + 주문 전송완료(대기 중이면)
                            if (tonOrderSendPending && tonOrderSendPending.orderId) {
                                scheduleTonOrderSendCompleteOnTelegramReturn();
                            }
                            // 전송 대기 중 복귀: SDK close*는 취소 알림을 유발할 수 있어 DOM만 숨김 + 브리지 복구
                            if (tonSendTransactionInFlight) {
                                try {
                                    hideTonConnectWidgetRootHard();
                                } catch (eVisInFlight) {}
                                scheduleTonBridgeKickDuringSend();
                                return;
                            }
                            if (tonConnectUIInstance && typeof tonConnectUIInstance.closeModal === 'function') {
                                try { tonConnectUIInstance.closeModal('wallet-selected'); } catch (eCloseVisible) {}
                            }
                            restoreTonConnectionSafe();
                        }
                    });
                    window.addEventListener('focus', function () {
                        if (tonOrderSendPending && tonOrderSendPending.orderId) {
                            scheduleTonOrderSendCompleteOnTelegramReturn();
                        }
                        if (tonSendTransactionInFlight) {
                            try {
                                hideTonConnectWidgetRootHard();
                            } catch (eFocInFlight) {}
                            scheduleTonBridgeKickDuringSend();
                            return;
                        }
                        if (tonConnectUIInstance && typeof tonConnectUIInstance.closeModal === 'function') {
                            try { tonConnectUIInstance.closeModal('wallet-selected'); } catch (eCloseFocus) {}
                        }
                        restoreTonConnectionSafe();
                    });
                    window.addEventListener('pageshow', function () {
                        if (tonOrderSendPending && tonOrderSendPending.orderId) {
                            scheduleTonOrderSendCompleteOnTelegramReturn();
                        }
                        if (tonSendTransactionInFlight) {
                            try {
                                hideTonConnectWidgetRootHard();
                            } catch (ePsInFlight) {}
                            scheduleTonBridgeKickDuringSend();
                        }
                    });
                    // 텔레그램 미니앱: 외부 앱 복귀 시 visibility가 안 오는 경우 보완
                    if (tg && typeof tg.onEvent === 'function') {
                        try {
                            tg.onEvent('viewportChanged', function () {
                                if (tonOrderSendPending && tonOrderSendPending.orderId) {
                                    scheduleTonOrderSendCompleteOnTelegramReturn();
                                }
                                if (tonSendTransactionInFlight) {
                                    try {
                                        hideTonConnectWidgetRootHard();
                                    } catch (eVpInFlight) {}
                                    scheduleTonBridgeKickDuringSend();
                                }
                            });
                        } catch (eVp) {}
                    }
                }
            } catch (e) {
                if (dom.tonConnectFallback) dom.tonConnectFallback.classList.remove('hidden');
                updateTonWalletStatusText('TON manifest error. Check tonconnect-manifest.json.');
                return;
            }

            // Detect connection status changes
            tonConnectUIInstance.onStatusChange(() => {
                const account = getTonConnectAccountSnapshot();
                const address = getTonAddressFromAccount(account);

                if (address) {
                    updateTonWalletStatusText('Connected');
                } else {
                    updateTonWalletStatusText('Not connected');
                }

                // 수동 복귀로 연결이 복원된 경우에도, 지갑 추가 화면에서는 주소를 자동 반영
                // (수정 모드가 아니고 입력칸이 비어있을 때만 채워 기존 수동 입력을 덮어쓰지 않음)
                var isWalletSettingsOpen = !!(dom.walletSettingsView && !dom.walletSettingsView.classList.contains('hidden'));
                var currentInput = dom.walletAddressInput && dom.walletAddressInput.value
                    ? String(dom.walletAddressInput.value).trim()
                    : '';
                if (
                    tonAddressAutofillArmed &&
                    isWalletSettingsOpen &&
                    tonWalletEditAddress === null &&
                    dom.walletAddressInput &&
                    address &&
                    !currentInput
                ) {
                    dom.walletAddressInput.value = address;
                    tonAddressAutofillArmed = false;
                }

                if (dom.tonConnectFallback) dom.tonConnectFallback.classList.add('hidden');
                refreshMyPageUsdtBalance();
            });
        }

        function ensureWalletReturnBack(link) {
            var s = String(link || '').trim();
            if (!s) return '';
            try {
                var u = new URL(s);
                // Tonkeeper 승인 후 텔레그램으로 복귀하도록 ret 전략을 강제
                u.searchParams.set('ret', getTonkeeperReturnStrategy());
                return u.toString();
            } catch (e) {
                // URL 파싱 실패 시 원본 사용
                return s;
            }
        }

        /** TonConnect·복귀 힌트용: 항상 봇 채팅 기본 주소만 사용 (short name 미사용) */
        function buildTelegramMiniAppReturnUrl() {
            return TON_TWA_RETURN_URL;
        }

        function getTonkeeperReturnStrategy() {
            // tg:// 딥링크 형식으로 반환: Tonkeeper가 서명 완료 후 Telegram 앱을 직접 열어 봇으로 이동
            return TON_RETURN_TG_DEEPLINK;
        }

        async function restoreTonConnectionSafe() {
            if (!tonConnectUIInstance || !tonConnectUIInstance.connector) return;
            if (typeof tonConnectUIInstance.connector.restoreConnection !== 'function') return;
            try {
                await tonConnectUIInstance.connector.restoreConnection();
            } catch (e) {
                // 복원 실패는 무시하고 다음 복귀 시 재시도
            }
        }

        /** 전송 대기 중 예약된 브리지 복구 타이머를 모두 취소 */
        function clearTonRestoreWhileSendTimers() {
            tonRestoreWhileSendTimers.forEach(function (tid) {
                try {
                    clearTimeout(tid);
                } catch (eClr) {}
            });
            tonRestoreWhileSendTimers = [];
        }

        /**
         * 톤키퍼에서 승인 후 텔레그램으로 늦게 돌아올 때 Open Wallet에 멈추는 현상 완화:
         * WebView가 백그라운드에 있으면 TonConnect 브리지가 잠시 끊겼다가 복귀 후에도 한 번의 restore만으로는
         * sendTransaction Promise가 안 풀리는 경우가 있어, 즉시 복구 + 지연 재시도를 합니다.
         */
        function scheduleTonBridgeKickDuringSend() {
            if (!tonSendTransactionInFlight) return;
            clearTonRestoreWhileSendTimers();
            try {
                void restoreTonConnectionSafe();
            } catch (e0) {}
            try {
                if (tg && typeof tg.expand === 'function') tg.expand();
            } catch (eExp) {}
            var delays = [350, 1200, 2800];
            delays.forEach(function (ms) {
                var tid = setTimeout(function () {
                    if (!tonSendTransactionInFlight) return;
                    try {
                        void restoreTonConnectionSafe();
                    } catch (e1) {}
                    try {
                        refreshMyOffers();
                    } catch (e2) {}
                }, ms);
                tonRestoreWhileSendTimers.push(tid);
            });
        }

        /**
         * TonConnect 지갑 연결 모달 (보관본 흐름 + 전송 후 숨긴 위젯 루트 복구 필수).
         * opts.skipDisconnectForTransfer === true: 전송 경로에서만 disconnect 생략.
         */
        async function openTonConnectModal(opts) {
            var o = opts && typeof opts === 'object' ? opts : {};
            var skipDisconnectForTransfer = o.skipDisconnectForTransfer === true;
            initTonConnectUIIfNeeded();
            if (!tonConnectUIInstance) {
                var noUiMsg = 'TON Connect 초기화에 실패했습니다.';
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(noUiMsg);
                else alert(noUiMsg);
                return;
            }
            // sendTransaction 정리 시 hideTonConnectWidgetRootHard()로 루트가 숨겨지면 openModal이 보이지 않음 → 반드시 복구
            try {
                restoreTonConnectWidgetRootVisible();
            } catch (eRw) {}
            // 사용자가 실제로 연결 버튼을 누른 경우에만 자동 입력 허용
            tonAddressAutofillArmed = true;
            var before = getTonAddressFromAccount(getTonConnectAccountSnapshot());
            try {
                // 이전 시도에서 남은 모달 상태가 있으면 먼저 닫아 버튼 무반응 상태를 줄임
                if (typeof tonConnectUIInstance.closeModal === 'function') {
                    try { tonConnectUIInstance.closeModal(); } catch (eClose) {}
                }
                // Add 모드에서 재연결할 때는 기존 세션을 먼저 끊고 시작 — 전송하기에서만 끊지 않음
                if (
                    !skipDisconnectForTransfer &&
                    tonWalletEditAddress === null &&
                    tonConnectUIInstance.connected &&
                    typeof tonConnectUIInstance.disconnect === 'function'
                ) {
                    try { await tonConnectUIInstance.disconnect(); } catch (eDisc) {}
                }
                // 자동복귀 성공률을 위해 플랫폼 구분 없이 TonConnect 기본 모달 경로를 우선 사용
                if (typeof tonConnectUIInstance.openModal === 'function') {
                    await tonConnectUIInstance.openModal();
                } else if (typeof tonConnectUIInstance.connectWallet === 'function') {
                    await tonConnectUIInstance.connectWallet();
                } else if (typeof tonConnectUIInstance.openSingleWalletModal === 'function') {
                    await tonConnectUIInstance.openSingleWalletModal();
                } else {
                    throw new Error('지원되는 연결 메서드를 찾지 못했습니다.');
                }
                // 모달에서 실제로 지갑이 바뀐 경우에만 입력란에 반영
                var connectedNow = getTonAddressFromAccount(getTonConnectAccountSnapshot());
                if (connectedNow && connectedNow !== before && dom.walletAddressInput) {
                    dom.walletAddressInput.value = connectedNow;
                    tonAddressAutofillArmed = false;
                }
                // 모달이 즉시 닫히는 환경 대응: 연결 결과를 짧게 재확인
                setTimeout(function () {
                    var after = getTonAddressFromAccount(getTonConnectAccountSnapshot());
                    if (after && after !== before && dom.walletAddressInput) {
                        dom.walletAddressInput.value = after;
                        tonAddressAutofillArmed = false;
                        return;
                    }
                    if (after) return;
                    // PC/데스크톱: tg.showAlert 닫기 시 포커스가 바뀌며 TonConnect 모달까지 같이 닫히는 경우가 있음 → 차단형 알림 사용 안 함
                    try {
                        restoreTonConnectionSafe();
                    } catch (eRS) {}
                }, 1200);
            } catch (e) {
                tonAddressAutofillArmed = false;
                var failMsg = 'TON 지갑 연결 창을 열지 못했습니다. ' + String(e && e.message ? e.message : e);
                if (tg && typeof tg.showAlert === 'function') tg.showAlert(failMsg);
                else alert(failMsg);
            }
        }

        function isTonTestnetConnected() {
            var account = getTonConnectAccountSnapshot();
            if (!account || typeof account !== 'object') return false;
            return String(account.chain || '') === '-3';
        }

        /** 보관본과 동일 + 전송 시에만 disconnect 생략(위 openTonConnectModal 옵션) */
        async function ensureTonWalletConnectedForTransfer() {
            initTonConnectUIIfNeeded();
            if (!tonConnectUIInstance) {
                throw new Error('TON Connect를 불러오지 못했습니다.');
            }
            var account = getTonConnectAccountSnapshot();
            var address = getTonAddressFromAccount(account);
            if (!address) {
                await openTonConnectModal({ skipDisconnectForTransfer: true });
                account = getTonConnectAccountSnapshot();
                address = getTonAddressFromAccount(account);
            }
            if (!address) throw new Error('연결된 TON 지갑이 없습니다.');
            if (!isTonTestnetConnected()) {
                throw new Error('테스트넷 지갑으로 연결해 주세요.');
            }
            return address;
        }

        function getTonWebTestnet() {
            if (tonWebTestnetInstance) return tonWebTestnetInstance;
            if (!window.TonWeb) throw new Error('TonWeb 라이브러리를 불러오지 못했습니다.');
            var TonWebClass = window.TonWeb;
            tonWebTestnetInstance = new TonWebClass(new TonWebClass.HttpProvider(TONCENTER_TESTNET_RPC));
            return tonWebTestnetInstance;
        }

        function toJettonNanoBn(usdtAmount) {
            var n = Number(usdtAmount || 0);
            if (!Number.isFinite(n) || n <= 0) throw new Error('전송 수량이 올바르지 않습니다.');
            var scaled = Math.round(n * 1000000); // USDT 6 decimals
            return new window.TonWeb.utils.BN(String(scaled));
        }

        function normalizeTonAddressStrict(addr) {
            var s = String(addr || '').trim();
            if (!s) throw new Error('TON 주소가 비어 있습니다.');
            if (s.indexOf('.....') !== -1) {
                throw new Error('마스킹된 주소입니다. 원본 TON 주소(48자)를 입력해 주세요.');
            }
            if (!window.TonWeb || !window.TonWeb.utils || !window.TonWeb.utils.Address) {
                throw new Error('TonWeb 주소 파서를 불러오지 못했습니다.');
            }
            try {
                // 주소 파싱만 통해 유효성을 검증하고, 표시는 사용자가 본 원본 형식을 유지
                new window.TonWeb.utils.Address(s);
                return s;
            } catch (e) {
                throw new Error('TON 주소 형식이 올바르지 않습니다. (48자 user-friendly 주소)');
            }
        }

        function isValidTonAddressStrict(addr) {
            try {
                normalizeTonAddressStrict(addr);
                return true;
            } catch (e) {
                return false;
            }
        }

        function saveUsdtTestnetMasterAddress() {
            var raw = dom.usdtTestnetMasterInput ? String(dom.usdtTestnetMasterInput.value || '').trim() : '';
            if (!raw) {
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'USDT 테스트넷 마스터 주소를 입력해 주세요.';
                return false;
            }
            var normalized = '';
            try {
                normalized = normalizeTonAddressStrict(raw);
            } catch (eNorm) {
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = String(eNorm && eNorm.message ? eNorm.message : 'TON 주소 형식이 올바르지 않습니다.');
                return false;
            }
            try {
                localStorage.setItem(USDT_TESTNET_MASTER_STORAGE_KEY, normalized);
            } catch (e) {
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = '저장에 실패했습니다.';
                return false;
            }
            if (dom.usdtTestnetMasterInput) dom.usdtTestnetMasterInput.value = normalized;
            if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'USDT 테스트넷 마스터 주소가 저장되었습니다.';
            return true;
        }

        function clearUsdtTestnetMasterAddress() {
            try { localStorage.removeItem(USDT_TESTNET_MASTER_STORAGE_KEY); } catch (e) {}
            if (dom.usdtTestnetMasterInput) dom.usdtTestnetMasterInput.value = '';
            if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'USDT 테스트넷 마스터 주소를 초기화했습니다.';
        }

        function getUsdtTestnetMasterAddress() {
            var saved = '';
            try { saved = String(localStorage.getItem(USDT_TESTNET_MASTER_STORAGE_KEY) || '').trim(); } catch (e) {}
            if (saved) return saved;
            throw new Error('설정에서 테스트넷 USDT 마스터 주소를 먼저 저장해 주세요.');
        }

        async function sendUsdtJettonOnTestnet(toAddress, usdtAmount, orderSendPendingTag) {
            var to = String(toAddress || '').trim();
            if (!to) throw new Error('수신 지갑 주소가 없습니다.');
            var sender = await ensureTonWalletConnectedForTransfer();
            if (!tonConnectUIInstance || typeof tonConnectUIInstance.sendTransaction !== 'function') {
                throw new Error('지갑 전송 기능을 사용할 수 없습니다.');
            }
            // 전송 UI 직전에만 pending 설정(연결 실패 시 잘못된 복귀·완료 처리 방지)
            if (orderSendPendingTag && orderSendPendingTag.orderId) {
                tonOrderSendPending = {
                    orderId: String(orderSendPendingTag.orderId),
                    side: orderSendPendingTag.side === 'sell' ? 'sell' : 'buy',
                    preSendReceiver:
                        orderSendPendingTag.preSendReceiver && typeof orderSendPendingTag.preSendReceiver === 'object'
                            ? Object.assign({}, orderSendPendingTag.preSendReceiver)
                            : null
                };
            }
            restoreTonConnectWidgetRootVisible();

            var TonWebClass = window.TonWeb;
            var tonweb = getTonWebTestnet();
            var masterAddress = normalizeTonAddressStrict(getUsdtTestnetMasterAddress());
            var ownerAddr = new TonWebClass.utils.Address(normalizeTonAddressStrict(sender));
            var toAddr = new TonWebClass.utils.Address(normalizeTonAddressStrict(to));
            var minter = new TonWebClass.token.jetton.JettonMinter(tonweb.provider, {
                address: new TonWebClass.utils.Address(masterAddress)
            });
            var fromJettonWallet = await minter.getJettonWalletAddress(ownerAddr);
            if (!fromJettonWallet) throw new Error('보내는 지갑의 USDT Jetton Wallet 조회에 실패했습니다.');

            var payloadCell = new TonWebClass.boc.Cell();
            payloadCell.bits.writeUint(0x0f8a7ea5, 32); // transfer op
            // query_id: 일부 지갑에서 과도하게 큰 값이 이상 동작을 유발할 수 있어 0 사용
            payloadCell.bits.writeUint(0, 64);
            payloadCell.bits.writeCoins(toJettonNanoBn(usdtAmount)); // jetton amount (6 decimals)
            payloadCell.bits.writeAddress(toAddr); // destination
            payloadCell.bits.writeAddress(ownerAddr); // response destination
            payloadCell.bits.writeBit(false); // custom_payload: none
            // TEP-74: 수신 쪽 Jetton Wallet 알림용 forward — 너무 작으면 지갑 UI/실행이 불안정할 수 있음
            payloadCell.bits.writeCoins(TonWebClass.utils.toNano('0.02'));
            payloadCell.bits.writeBit(false); // forward_payload: none

            var payloadBoc = await payloadCell.toBoc(false);
            var payloadBase64 = TonWebClass.utils.bytesToBase64(payloadBoc);

            // 테스트넷 트랜잭션임을 TonConnect에 명시
            var tx = {
                network: '-3',
                validUntil: Math.floor(Date.now() / 1000) + 5 * 60,
                messages: [{
                    // 네 번째 인자 true = 테스트넷 user-friendly (지갑이 체인과 일치시키지 않으면 전송 UI가 깨질 수 있음)
                    address: fromJettonWallet.toString(true, true, true, true),
                    // Jetton wallet 내부 전송 + forward에 필요한 TON (테스트넷)
                    amount: TonWebClass.utils.toNano('0.12').toString(),
                    payload: payloadBase64
                }]
            };
            // 외부 지갑 복귀 콜백이 끊긴 경우 sendTransaction이 오래 대기할 수 있어 타임아웃을 둡니다.
            // notifications 기본값 'all'이면 SDK가 error 계열(취소로 오인 등) 토스트를 띄울 수 있어 success/error는 끔 — 안내는 앱에서 처리
            var sendTxUiOpts = {
                // twaReturnUrl은 TWA 지갑(Wallet on Telegram) 전용 — Tonkeeper 독립 앱은 returnStrategy 사용
                twaReturnUrl: TON_TWA_RETURN_URL,
                modals: ['before'],
                notifications: ['before']
            };
            var result;
            tonSendTransactionInFlight = true;
            try {
                result = await Promise.race([
                    tonConnectUIInstance.sendTransaction(tx, sendTxUiOpts),
                    new Promise(function (_, reject) {
                        setTimeout(function () {
                            reject(new Error('TON_TX_TIMEOUT_AFTER_APPROVAL'));
                        }, 120000);
                    })
                ]);
            } finally {
                // 즉시 closeModal은 SDK가 지갑과 마무리하는 타이밍과 충돌할 수 있어 한 번만 지연 후 정리
                setTimeout(function () {
                    clearTonRestoreWhileSendTimers();
                    closeTonConnectModalAggressive(true);
                    setTimeout(function () {
                        tonSendTransactionInFlight = false;
                        try {
                            restoreTonConnectionSafe();
                        } catch (eRest) {}
                        // inFlight가 true일 때는 aggressive가 루트를 숨기지 못했으므로, 여기서 한 번만 숨김(restore 호출 없음 → 깜빡임 방지)
                        try {
                            hideTonConnectWidgetRootHard();
                        } catch (eHide) {}
                    }, 120);
                }, 450);
            }
            var txId = '';
            if (result && typeof result === 'object') {
                if (typeof result.boc === 'string') txId = result.boc;
                else if (typeof result.transaction === 'string') txId = result.transaction;
                else if (typeof result.hash === 'string') txId = result.hash;
            }
            return txId;
        }

        async function copyTonWalletAddress() {
            if (!dom.walletAddressInput) return;
            const value = dom.walletAddressInput.value ? dom.walletAddressInput.value.trim() : '';
            if (!value) return;

            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(value);
                    if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'Copied!';
                    return;
                }
            } catch (e) {
                // fallback below
            }

            // Fallback for environments without clipboard API
            const tmp = document.createElement('textarea');
            tmp.value = value;
            tmp.style.position = 'fixed';
            tmp.style.left = '-9999px';
            document.body.appendChild(tmp);
            tmp.focus();
            tmp.select();
            try {
                document.execCommand('copy');
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'Copied!';
            } catch (e) {
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'Copy failed.';
            } finally {
                document.body.removeChild(tmp);
            }
        }

        let tonWalletEditAddress = null;
        let bankEditId = null;

        function showTonWalletDeleteButton(show) {
            const btn = document.getElementById('tonWalletDeleteBtn');
            if (!btn) return;
            btn.style.display = show ? 'block' : 'none';
        }

        function deleteTonWalletFromModal() {
            if (!tonWalletEditAddress) return;
            deleteTonWallet(tonWalletEditAddress);
            tonWalletEditAddress = null;
            showTonWalletDeleteButton(false);
        }

        function showBankAccountDeleteButton(show) {
            const btn = document.getElementById('bankAccountDeleteBtn');
            if (!btn) return;
            btn.style.display = show ? 'block' : 'none';
        }

        function deleteBankAccountFromModal() {
            if (!bankEditId) return;
            deleteBankAccount(bankEditId);
            bankEditId = null;
            showBankAccountDeleteButton(false);
        }

        function openWalletSettings() {
            if (dom.myPageSettingsMainView) dom.myPageSettingsMainView.classList.remove('hidden');
            if (dom.walletSettingsView) dom.walletSettingsView.classList.remove('hidden');
            if (dom.bankAccountsSettingsView) dom.bankAccountsSettingsView.classList.add('hidden');

            // Add mode (not editing an existing wallet)
            tonWalletEditAddress = null;
            if (dom.walletAddressInput) {
                dom.walletAddressInput.readOnly = false;
                dom.walletAddressInput.removeAttribute('readonly');
            }
            showTonWalletDeleteButton(false);

            initTonConnectUIIfNeeded();

            // Add 화면에서는 자동 프리필하지 않음(연결 버튼 성공 시에만 채움)
            const connected = getTonAddressFromAccount(getTonConnectAccountSnapshot());
            if (dom.walletAddressInput) dom.walletAddressInput.value = '';
            if (dom.walletLabelInput) dom.walletLabelInput.value = '';

            const defaultAddress = getDefaultTonWalletAddress();
            if (dom.setDefaultTonWalletSwitch) dom.setDefaultTonWalletSwitch.checked = connected && connected === defaultAddress;
            // 테스트넷 USDT 마스터 주소를 설정 화면에서 즉시 확인/수정
            if (dom.usdtTestnetMasterInput) {
                var savedMaster = '';
                try { savedMaster = String(localStorage.getItem(USDT_TESTNET_MASTER_STORAGE_KEY) || '').trim(); } catch (eLoad) {}
                dom.usdtTestnetMasterInput.value = savedMaster || '';
            }

            if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = '&nbsp;';
        }

        // Edit existing TON wallet (label only; address is read-only)
        function editTonWallet(address) {
            if (!address) return;
            openWalletSettings();
            tonWalletEditAddress = address;
            showTonWalletDeleteButton(true);

            const wallets = loadTonWallets();
            const found = wallets.find(w => w.address === address);

            if (dom.walletAddressInput) {
                dom.walletAddressInput.value = address;
                dom.walletAddressInput.readOnly = true;
            }
            if (dom.walletLabelInput) dom.walletLabelInput.value = (found && found.label) ? found.label : '';

            const defaultAddress = getDefaultTonWalletAddress();
            if (dom.setDefaultTonWalletSwitch) dom.setDefaultTonWalletSwitch.checked = address === defaultAddress;

            if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = '&nbsp;';
        }

        function disconnectTonWallet() {
            if (!tonConnectUIInstance) {
                updateTonWalletStatusText('Not connected.');
                return;
            }
            tonConnectUIInstance.disconnect().catch(() => {
                // UI updates via onStatusChange
            });
            if (dom.walletAddressInput) dom.walletAddressInput.value = '';
        }

        function saveTonWallet() {
            const address = dom.walletAddressInput ? dom.walletAddressInput.value.trim() : '';
            const label = dom.walletLabelInput ? dom.walletLabelInput.value.trim() : '';
            const setDefault = dom.setDefaultTonWalletSwitch ? dom.setDefaultTonWalletSwitch.checked : false;
            const masterInput = dom.usdtTestnetMasterInput ? String(dom.usdtTestnetMasterInput.value || '').trim() : '';

            if (!address) {
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'Please enter wallet address.';
                return;
            }
            let normalizedAddress = '';
            try {
                normalizedAddress = normalizeTonAddressStrict(address);
            } catch (eAddr) {
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = String(eAddr && eAddr.message ? eAddr.message : 'TON 주소 형식이 올바르지 않습니다.');
                return;
            }

            const wallets = loadTonWallets();
            const idx = wallets.findIndex(w => w.address === normalizedAddress);
            const nextLabel = label || (idx >= 0 && wallets[idx].label ? wallets[idx].label : 'TON Wallet');

            if (idx >= 0) {
                wallets[idx] = { ...wallets[idx], address: normalizedAddress, label: nextLabel, network: 'TON', updatedAt: Date.now() };
            } else {
                wallets.unshift({ address: normalizedAddress, label: nextLabel, network: 'TON', updatedAt: Date.now() });
            }

            try {
                localStorage.setItem(STORAGE.TON_WALLETS, JSON.stringify(wallets));
            } catch (e) {
                if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'Failed to save. Please check browser settings.';
                return;
            }
            cloudSetItem(STORAGE.TON_WALLETS, JSON.stringify(wallets));

            const currentDefault = getDefaultTonWalletAddress();
            if (setDefault || !currentDefault) setDefaultTonWalletAddress(normalizedAddress);
            else renderSavedWallets();

            if (masterInput) saveUsdtTestnetMasterAddress();
            if (dom.walletSaveMsg) dom.walletSaveMsg.innerText = 'Saved!';
            showMyPageSettingsMain();
            refreshMyPageUsdtBalance();
        }

        function openBankAccountsSettings() {
            bankEditId = null; // Add mode
            if (dom.myPageSettingsMainView) dom.myPageSettingsMainView.classList.remove('hidden');
            if (dom.bankAccountsSettingsView) dom.bankAccountsSettingsView.classList.remove('hidden');
            if (dom.walletSettingsView) dom.walletSettingsView.classList.add('hidden');

            if (dom.bankSaveMsg) dom.bankSaveMsg.innerText = '&nbsp;';

            if (dom.bankAccountNumberInput) dom.bankAccountNumberInput.value = '';
            if (dom.bankAccountHolderInput) dom.bankAccountHolderInput.value = '';
            if (dom.bankAccountLabelInput) dom.bankAccountLabelInput.value = '';
            if (dom.setDefaultBankAccountSwitch) dom.setDefaultBankAccountSwitch.checked = false;
            showBankAccountDeleteButton(false);
        }

        // Edit existing bank account
        function editBankAccount(id) {
            if (!id) return;
            openBankAccountsSettings();
            bankEditId = String(id);

            const accounts = loadBankAccounts();
            const found = accounts.find(a => String(a.id) === String(id));
            if (!found) return;

            if (dom.bankNameSelect) {
                const bankValue = found.bank || '';
                const hasOption = Array.from(dom.bankNameSelect.options).some(o => o.value === bankValue);
                if (!hasOption && bankValue) {
                    const opt = document.createElement('option');
                    opt.value = bankValue;
                    opt.textContent = bankValue;
                    dom.bankNameSelect.appendChild(opt);
                }
                dom.bankNameSelect.value = bankValue;
            }
            if (dom.bankAccountNumberInput) dom.bankAccountNumberInput.value = found.accountNumber || '';
            if (dom.bankAccountHolderInput) dom.bankAccountHolderInput.value = found.accountHolder || '';
            if (dom.bankAccountLabelInput) dom.bankAccountLabelInput.value = found.label || '';

            const defaultId = localStorage.getItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);
            if (dom.setDefaultBankAccountSwitch) dom.setDefaultBankAccountSwitch.checked = String(found.id) === String(defaultId);

            if (dom.bankSaveMsg) dom.bankSaveMsg.innerText = '&nbsp;';
            showBankAccountDeleteButton(true);
        }

        function saveBankAccount() {
            const bank = dom.bankNameSelect ? dom.bankNameSelect.value : '';
            const accountNumber = dom.bankAccountNumberInput ? dom.bankAccountNumberInput.value.trim() : '';
            const accountHolder = dom.bankAccountHolderInput ? dom.bankAccountHolderInput.value.trim() : '';
            const label = dom.bankAccountLabelInput ? dom.bankAccountLabelInput.value.trim() : '';
            const setDefault = dom.setDefaultBankAccountSwitch ? dom.setDefaultBankAccountSwitch.checked : false;

            if (!bank || !accountNumber || !accountHolder) {
                if (dom.bankSaveMsg) dom.bankSaveMsg.innerText = 'Please fill bank / account number / account holder.';
                return;
            }

            const payload = {
                id: bankEditId ? String(bankEditId) : String(Date.now()),
                bank,
                accountNumber,
                accountHolder,
                label: label || 'Bank Account',
                updatedAt: Date.now()
            };

            const accounts = loadBankAccounts();
            if (bankEditId) {
                const idx = accounts.findIndex(a => String(a.id) === String(bankEditId));
                if (idx >= 0) accounts[idx] = { ...accounts[idx], ...payload };
                else accounts.push(payload);
            } else {
                accounts.push(payload);
            }

            try {
                localStorage.setItem(STORAGE.BANK_ACCOUNTS, JSON.stringify(accounts));
            } catch (e) {
                if (dom.bankSaveMsg) dom.bankSaveMsg.innerText = 'Failed to save. Please check browser settings.';
                return;
            }

            cloudSetItem(STORAGE.BANK_ACCOUNTS, JSON.stringify(accounts));

            const hasDefault = !!localStorage.getItem(STORAGE.DEFAULT_BANK_ACCOUNT_ID);
            if (setDefault || !hasDefault) setDefaultBankAccount(payload.id);
            else renderSavedBankAccounts();

            if (dom.bankSaveMsg) dom.bankSaveMsg.innerText = 'Saved!';
            showMyPageSettingsMain();
        }

        // --------------------------------------------------------
        // Initialization
        (async function initPaymentAndUI() {
            try {
                bindTelegramUser();
                try {
                    var savedTheme = localStorage.getItem(UI_THEME_STORAGE_KEY);
                    var savedLang = localStorage.getItem(UI_LANG_STORAGE_KEY);
                    if (savedTheme === 'light' || savedTheme === 'dark') uiThemeMode = savedTheme;
                    if (savedLang === 'ko' || savedLang === 'en') uiLangMode = savedLang;
                } catch (ePrefs) {}
                applyThemeMode();
                applyLanguageMode();
                // 배포 시 index.html이 예전 버전(showPreparingNotice)이어도 푸터가 동작하도록 onclick 덮어씀
                try {
                    var _fp = document.getElementById('footerPrivacyBtn');
                    var _ft = document.getElementById('footerTermsBtn');
                    if (_fp) _fp.onclick = function () { showPrivacyPolicy(); };
                    if (_ft) _ft.onclick = function () { showTermsOfService(); };
                } catch (eLegalFooter) {}
                loadSellerAlertedOrderIds();
                // 삭제 버튼 이벤트를 JS로도 한 번 더 바인딩(웹뷰별 onclick 누락 이슈 대응)
                try {
                    var detailDeleteBtn = document.getElementById('detailDeleteBtn');
                    if (detailDeleteBtn) {
                        detailDeleteBtn.addEventListener('click', function (e) {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                            deleteListingFromDetail();
                        });
                    }
                } catch (eBind) {}
                await syncCloudToLocal();
                purgeLegacyVirtualListingsFromStorage();

                // 기본/안전장치 로직이 loadMarketplace 내부에 있으므로 즉시 렌더합니다.
                loadMarketplace();
                startOrdersRealtimeSync();
                if (document && typeof document.addEventListener === 'function') {
                    document.addEventListener('visibilitychange', function () {
                        if (document.visibilityState === 'visible') pollOrdersRealtime();
                    });
                }
                updateMyPageKycUi();
                renderSavedWallets();
                renderSavedBankAccounts();
            } catch (e) {
                console.error('initPaymentAndUI failed:', e);
                // 최소한 마켓플레이스는 시도
                try { loadMarketplace(); } catch (e2) {}
                try { startOrdersRealtimeSync(); } catch (e3) {}
            }
        })();
    