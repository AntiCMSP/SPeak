// ==UserScript==
// @name         AntiCMSP SPeak
// @namespace    https://anticmsp.foo.ng/
// @version      2026-01-07
// @description  Cansado de ter que pensar nas respostas das lições do SPeak? AntiCMSP SPeak chegou.
// @author       AntiCMSP Scripts
// @match        *://learn.better.efekta.com/*
// @match        *://lesson-player.study.better.efekta.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.cookie
// @grant        GM_cookie
// ==/UserScript==

(async function () {
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    let sessionToken = sessionStorage.getItem('anticmsp.sid') || null;
    let cookies;

    if (!location.origin.includes('lesson-player')) {
        pageWindow.addEventListener('message', async (event) => {
            const isFromEfekta = event.origin === 'https://lesson-player.study.better.efekta.com';

            if (isFromEfekta && event.data && event.data.type === 'ANTICMSP_LESSON_DATA') {
                handleInterceptedLesson(event.data.payload);
            }
        });
    }

    if (location.origin.includes('lesson-player')) {
        const originalOpen = pageWindow.XMLHttpRequest.prototype.open;
        const originalSend = pageWindow.XMLHttpRequest.prototype.send;

        pageWindow.XMLHttpRequest.prototype.open = function (method, url, ...args) {
            this._url = url;
            this._method = method;
            return originalOpen.apply(this, [method, url, ...args]);
        };

        pageWindow.XMLHttpRequest.prototype.send = function (body, ...args) {
            try {
                const isCommandUrl = typeof this._url === 'string' && this._url.endsWith('/command');
                const isPost = this._method?.toUpperCase() === 'POST';

                if (isCommandUrl && isPost && body) {
                    const bodyObj = JSON.parse(body);

                    if (bodyObj.commandType === 'open-lesson') {
                        this.addEventListener('load', function () {
                            try {
                                const data = JSON.parse(this.responseText);
                                const jsonStr = JSON.stringify(data);

                                const base64Data = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (match, p1) => {
                                    return String.fromCharCode(parseInt(p1, 16));
                                }));

                                pageWindow.parent.postMessage({
                                    type: 'ANTICMSP_LESSON_DATA',
                                    payload: base64Data
                                }, '*');
                            } catch (err) {
                                console.error('[AntiCMSP] Erro ao processar resposta do XHR:', err);
                            }
                        });
                    }
                }
            } catch {}

            return originalSend.apply(this, [body, ...args]);
        };
    }

    function executeWhenReady(callback) {
        if (document.body) {
            callback();
        } else {
            document.addEventListener('DOMContentLoaded', callback);
        }
    }

    async function startSession() {
        if (sessionToken) {
          try {
            const userSessionCheckRes = await gmFetch(`https://anticmsp.foo.ng/api/speak/validate-user-session?id=${sessionToken}`, {
                  method: 'GET',
                  headers: { 'content-type': 'application/json' }
              });

            if (userSessionCheckRes.ok) {
              const userSessionCheckJson = await userSessionCheckRes.json();
              if (userSessionCheckJson.data.valid) {
                return true;
              } else {
                sessionStorage.removeItem('anticmsp.sid');
              }
            }
          } catch {
            sessionStorage.removeItem('anticmsp.sid');
          }
        }

        if (Object.keys(cookies).length === 0) {
            executeWhenReady(() => createModal('Houve um problema inesperado.\nCÓD. NO_COOKIES'));
            return false;
        }

        try {
            const userSessionIdRes = await gmFetch('https://anticmsp.foo.ng/api/speak/create-user-session', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ cookies })
            });

            if (!userSessionIdRes.ok) {
                executeWhenReady(() => createModal('Houve um problema inesperado.\nCÓD. USER_SESSION_ID_NOT_OK'));
                return false;
            }

            const userSessionIdJson = await userSessionIdRes.json();

            if (userSessionIdJson.message.toLowerCase() === 'plan required') {
                executeWhenReady(() => createModal('Você não possui o Plano Ouro requerido para esse script!\nCÓD. MISSING_PLAN'));
                return false;
            }

            sessionToken = userSessionIdJson.data.session;
            sessionStorage.setItem('anticmsp.sid', sessionToken);
            return true;
        } catch (err) {
            console.error('Erro na sincronização de sessão:', err);
            return false;
        }
    }

    async function handleInterceptedLesson(base64Payload) {
        const validSession = await startSession();
        if (!validSession) return;

        try {
            const answers = await gmFetch('https://anticmsp.foo.ng/api/speak/get-lesson-answers', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'authorization': sessionToken
                },
                body: JSON.stringify({ data: base64Payload })
            });

            if (!answers.ok) {
                if (answers.status === 401) sessionStorage.removeItem('anticmsp.sid');
                executeWhenReady(() => createModal('Houve um problema ao processar dados.\nCÓD. ANSWERS_NOT_OK'));
                return;
            }

            const answersJson = await answers.json();
            executeWhenReady(() => createAnswersWindow(answersJson.data));
        } catch (error) {
            console.error('Erro ao enviar dados interceptados para o backend:', error);
        }
    }

    function injectStyles() {
        if (document.getElementById('anticmsp-styles')) return;
        const style = document.createElement('style');
        style.id = 'anticmsp-styles';
        style.textContent = `
            .anticmsp { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
            .anticmsp.window, .anticmsp.modal { position: fixed; top: 80px; left: 80px; width: 420px; max-height: 80vh; background: #fff; border: 1px solid #cfcfcf; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.2); overflow: hidden; z-index: 999999; }
            .anticmsp.modal { width: 350px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
            .anticmsp.window-nav, .anticmsp.modal-nav { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f00; color: white; cursor: move; user-select: none; }
            .anticmsp.window-nav p, .anticmsp.modal-nav p { margin: 0; font-weight: bold; }
            #anticmsp-window-close, #anticmsp-modal-close { cursor: pointer; font-size: 16px; padding: 2px 8px; border-radius: 4px; }
            #anticmsp-window-close:hover, #anticmsp-modal-close:hover { background: rgba(255,255,255,.15); }
            .anticmsp.window-content, .anticmsp.modal-content { padding: 12px; overflow-y: auto; max-height: calc(80vh - 48px); }
            .anticmsp.lesson { margin-bottom: 16px; }
            .anticmsp.answer-box { margin-top: 6px; padding: 10px; border-radius: 6px; background: #f5f5f5; border: 1px solid #e5e5e5; }
            .anticmsp.answer-box img { width: 100%; height: auto; border-radius: 5px; }
            .anticmsp.item { display: inline-block; margin: 4px; padding: 5px 10px; border-radius: 5px; background: #e51e1e; color: white; font-size: 13px; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || "GET",
                url: url,
                headers: options.headers || {},
                data: options.body || null,
                onload: function(response) {
                    resolve({
                        ok: response.status >= 200 && response.status < 300,
                        status: response.status,
                        json: async () => JSON.parse(response.responseText),
                        text: async () => response.responseText
                    });
                },
                onerror: (error) => reject(error)
            });
        });
    }

    function createModal(content) {
        injectStyles();
        const modalHtml = `
        <div class="anticmsp modal">
            <div class="anticmsp modal-nav">
                <div><p>AntiCMSP Scripts</p></div>
                <div><p id="anticmsp-modal-close">X</p></div>
            </div>
            <div class="anticmsp modal-content">
                <p>${content}</p>
            </div>
        </div>`;

        const template = document.createElement('template');
        template.innerHTML = modalHtml.trim();
        const modalEl = template.content.firstElementChild;

        modalEl.querySelector('#anticmsp-modal-close').addEventListener('click', destroyModal);
        document.body.appendChild(modalEl);
    }

    function destroyModal(e) {
        e.target.closest('.anticmsp.window')?.remove();
        e.target.closest('.anticmsp.modal')?.remove();
    }

    function makeDraggable(element) {
        const handle = element.querySelector('.window-nav');
        if (!handle) return;

        let offsetX = 0, offsetY = 0, dragging = false;

        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragging = true;
            const rect = element.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            element.style.left = `${rect.left}px`;
            element.style.top = `${rect.top}px`;
            element.style.transform = 'none';

            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', stop);
        });

        function move(e) {
            if (!dragging) return;
            element.style.left = `${e.clientX - offsetX}px`;
            element.style.top = `${e.clientY - offsetY}px`;
        }

        function stop() {
            dragging = false;
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', stop);
        }
    }

    function createAnswersWindow(obj) {
        injectStyles();
        const windowContentContainer = document.createElement('div');
        windowContentContainer.classList.add('anticmsp', 'window-content');

        const lessonName = obj.title;
        const lessonPages = obj.pages;

        for (const lessonPage of lessonPages) {
            const lessonType = lessonPage.type.replace('question-', '');
            const lessonAnswer = lessonPage.answer;

            if (['informational', 'speaking-practice', 'writing-challenge', 'ai-roleplay-fluency'].includes(lessonType)) continue;

            const lessonContainer = document.createElement('div');
            lessonContainer.classList.add('anticmsp', 'lesson', lessonPage.type);

            const lessonTitleContainer = document.createElement('div');
            const lessonTitle = document.createElement('p');
            lessonTitle.innerHTML = lessonPage.body;
            lessonTitleContainer.appendChild(lessonTitle);
            lessonContainer.appendChild(lessonTitleContainer);

            const lessonAnswerContainer = document.createElement('div');
            lessonAnswerContainer.classList.add('anticmsp', 'lesson', 'answer-box');

            if (lessonType === 'alternative') {
                const lessonAnswerText = document.createElement('p');
                lessonAnswerText.innerHTML = lessonAnswer;
                lessonAnswerContainer.appendChild(lessonAnswerText);
            } else if (lessonType === 'matching') {
                const item = document.createElement('div');
                lessonAnswer.forEach(i => {
                    const firstContainer = document.createElement('div');
                    const secondContainer = document.createElement('div');
                    firstContainer.innerHTML = i.left;
                    secondContainer.innerHTML = i.right;
                    item.appendChild(firstContainer);
                    item.appendChild(secondContainer);
                    item.innerHTML += '<br><br>';
                });
                lessonAnswerContainer.appendChild(item);
            } else if (lessonType === 'gapfill') {
                const item = document.createElement('div');
                lessonAnswer.forEach(i => {
                    const fill = document.createElement('span');
                    fill.classList.add('anticmsp', 'item');
                    fill.innerHTML = i;
                    item.appendChild(fill);
                });
                lessonAnswerContainer.appendChild(item);
            } else if (lessonType === 'sequencing') {
                const item = document.createElement('div');
                lessonAnswer.forEach(i => {
                    const sequence = document.createElement('span');
                    sequence.classList.add('anticmsp', 'item');
                    sequence.innerHTML = `${i}<br>`;
                    item.appendChild(sequence);
                });
                lessonAnswerContainer.appendChild(item);
            } else if (lessonType === 'categorisation') {
                const categories = Object.keys(lessonAnswer);
                categories.forEach(c => {
                    const categoryContainer = document.createElement('div');
                    const itemsContainer = document.createElement('div');
                    const categoryName = document.createElement('p');
                    categoryName.innerHTML = c;

                    lessonAnswer[c].forEach(item => {
                        const itemContainer = document.createElement('div');
                        itemContainer.classList.add('anticmsp', 'parent');
                        const term = document.createElement('span');
                        term.classList.add('anticmsp', 'item');
                        term.innerHTML = `${item}<br>`;
                        itemContainer.appendChild(term);
                        itemsContainer.appendChild(itemContainer);
                    });

                    categoryContainer.appendChild(categoryName);
                    categoryContainer.appendChild(itemsContainer);
                    lessonAnswerContainer.appendChild(categoryContainer);
                });
            } else {
                const lessonAnswerText = document.createElement('p');
                lessonAnswerText.innerHTML = lessonAnswer;
                lessonAnswerContainer.appendChild(lessonAnswerText);
            }

            lessonContainer.appendChild(lessonAnswerContainer);
            windowContentContainer.appendChild(lessonContainer);
        }

        const windowHtml = `
        <div class="anticmsp window">
            <div class="anticmsp window-nav draggable">
                <div><p>${lessonName}</p></div>
                <div><p id="anticmsp-window-close">X</p></div>
            </div>
            ${windowContentContainer.outerHTML}
        </div>`;

        const template = document.createElement('template');
        template.innerHTML = windowHtml.trim();
        const windowEl = template.content.firstElementChild;

        windowEl.querySelector('#anticmsp-window-close').addEventListener('click', destroyModal);
        makeDraggable(windowEl);
        document.body.appendChild(windowEl);
    }

    async function getCookiesAsObject() {
        return new Promise((resolve) => {
            try {
                GM_cookie.list({ url: window.location.origin }, (originalCookies, error) => {
                    if (error || !originalCookies) {
                        resolve({});
                        return;
                    }

                    const cookieObject = originalCookies.reduce((accumulator, cookie) => {
                        accumulator[cookie.name] = cookie.value;
                        return accumulator;
                    }, {});

                    resolve(cookieObject);
                });
            } catch {
                resolve({});
            }
        });
    }

    executeWhenReady(async () => {
        const cookiesGrabbed = await getCookiesAsObject();

        if (location.origin.includes('lesson-player')) {
            console.log('[AntiCMSP SPeak] Iniciado no iframe');
        } else {
            console.log('[AntiCMSP SPeak] Iniciado no principal');
            cookies = cookiesGrabbed;
            startSession();
        }
    });
})();
