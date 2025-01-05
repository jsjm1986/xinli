document.addEventListener('DOMContentLoaded', () => {
    const chatService = new ChatService();
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const exportButton = document.getElementById('exportButton');
    const clearButton = document.getElementById('clearButton');
    const emotionIndicator = document.getElementById('emotionIndicator');
    const currentStageName = document.getElementById('currentStageName');
    const currentStageDesc = document.getElementById('currentStageDesc');
    const voiceInputBtn = document.getElementById('voiceInputBtn');
    const voiceStatus = document.getElementById('voiceStatus');

    // 语音识别相关变量
    let recognition = null;
    let isRecording = false;

    // 初始化语音识别
    function initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'zh-CN';

            recognition.onstart = () => {
                isRecording = true;
                voiceInputBtn.classList.add('recording');
                voiceStatus.classList.add('active');
                userInput.placeholder = '正在聆听...';
            };

            recognition.onend = () => {
                isRecording = false;
                voiceInputBtn.classList.remove('recording');
                voiceStatus.classList.remove('active');
                userInput.placeholder = '请输入您想说的话...';
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                // 显示临时结果
                if (interimTranscript !== '') {
                    userInput.value = interimTranscript;
                }

                // 如果有最终结果
                if (finalTranscript !== '') {
                    userInput.value = finalTranscript;
                    // 可选：自动发送
                    // sendMessage();
                }
            };

            recognition.onerror = (event) => {
                console.error('语音识别错误:', event.error);
                isRecording = false;
                voiceInputBtn.classList.remove('recording');
                voiceStatus.classList.remove('active');
                userInput.placeholder = '请输入您想说的话...';
                
                // 显示错误提示
                if (event.error === 'not-allowed') {
                    alert('请允许使用麦克风以启用语音输入功能');
                } else {
                    alert('语音识别出错，请重试或使用键盘输入');
                }
            };

            return true;
        } else {
            console.log('浏览器不支持语音识别');
            voiceInputBtn.style.display = 'none';
            return false;
        }
    }

    // 处理语音输入按钮点击
    function handleVoiceInput() {
        if (!recognition) {
            if (!initSpeechRecognition()) {
                alert('您的浏览器不支持语音识别功能，请使用Chrome浏览器');
                return;
            }
        }

        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    }

    // 绑定语音输入按钮事件
    voiceInputBtn.addEventListener('click', handleVoiceInput);

    // 阶段描述
    const stageDescriptions = {
        initial: '建立信任关系，了解基本情况',
        assessment: '评估问题，探索原因和影响',
        goal_setting: '设定具体可行的改变目标',
        intervention: '实施干预策略，培养应对技能',
        closing: '总结进展，巩固成果，规划未来'
    };

    // 情绪图标映射
    const emotionIcons = {
        positive: '😊',
        negative: '😔',
        neutral: '😐'
    };

    // 更新阶段显示
    function updateStageDisplay(stage) {
        // 更新进度条
        document.querySelectorAll('.stage-item').forEach(item => {
            item.classList.remove('active', 'completed');
            if (item.dataset.stage === stage) {
                item.classList.add('active');
            } else if (Object.values(CONFIG.COUNSELING_STAGES).indexOf(item.dataset.stage) < 
                      Object.values(CONFIG.COUNSELING_STAGES).indexOf(stage)) {
                item.classList.add('completed');
            }
        });

        // 更新阶段信息
        const stageName = stage.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
        currentStageName.textContent = stageName;
        currentStageDesc.textContent = stageDescriptions[stage];
    }

    // 更新情绪显示
    function updateEmotionDisplay(emotion) {
        const icon = emotionIcons[emotion] || '😊';
        emotionIndicator.querySelector('.emotion-icon').textContent = icon;
        emotionIndicator.querySelector('.emotion-text').textContent = 
            `当前情绪: ${emotion === 'positive' ? '积极' : emotion === 'negative' ? '消极' : '平静'}`;
    }

    // 添加消息到聊天界面
    function addMessage(content, isUser, isStream = false) {
        let messageDiv;
        if (isStream) {
            // 在流式输出时，获取或创建最后一条AI消息
            messageDiv = chatMessages.lastElementChild;
            if (!messageDiv || messageDiv.classList.contains('user')) {
                messageDiv = document.createElement('div');
                messageDiv.className = 'message ai';
                const messageContent = document.createElement('div');
                messageContent.className = 'message-content';
                messageDiv.appendChild(messageContent);
                chatMessages.appendChild(messageDiv);
            }
            messageDiv.querySelector('.message-content').textContent += content;
        } else {
            // 非流式输出时，创建新消息
            messageDiv = document.createElement('div');
            messageDiv.className = `message ${isUser ? 'user' : 'ai'}`;
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            messageContent.textContent = content;
            
            messageDiv.appendChild(messageContent);
            chatMessages.appendChild(messageDiv);
        }
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 发送消息
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        // 如果正在录音，先停止录音
        if (isRecording) {
            recognition.stop();
        }

        // 禁用输入和发送按钮
        userInput.disabled = true;
        sendButton.disabled = true;
        voiceInputBtn.disabled = true;

        try {
            // 显示用户消息
            addMessage(message, true);
            userInput.value = '';

            // 获取AI回复
            const response = await chatService.sendMessage(message);
            addMessage(response, false);

            // 更新阶段显示
            updateStageDisplay(chatService.getCurrentStage());

            // 更新情绪显示
            const emotion = chatService.analyzeEmotion(message);
            updateEmotionDisplay(emotion);
        } catch (error) {
            addMessage('抱歉，发生了一些错误，请稍后重试。', false);
        } finally {
            // 重新启用输入和发送按钮
            userInput.disabled = false;
            sendButton.disabled = false;
            voiceInputBtn.disabled = false;
            userInput.focus();
        }
    }

    // 导出聊天记录
    exportButton.addEventListener('click', () => {
        chatService.exportHistory();
    });

    // 清除聊天记录
    clearButton.addEventListener('click', () => {
        if (confirm('确定要清除所有聊天记录吗？')) {
            chatService.clearHistory();
            chatMessages.innerHTML = '';
            updateStageDisplay(CONFIG.COUNSELING_STAGES.INITIAL);
            addMessage('你好！我是AI心理咨询师，很高兴能和你交流。请告诉我你想聊些什么？', false);
        }
    });

    // 绑定发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);

    // 绑定回车发送
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 初始化阶段显示
    updateStageDisplay(chatService.getCurrentStage());

    // 显示欢迎消息
    addMessage('你好！我是AI心理咨询师，很高兴能和你交流。请告诉我你想聊些什么？', false);

    // 初始化语音识别
    initSpeechRecognition();
}); 