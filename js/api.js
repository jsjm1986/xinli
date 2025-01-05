class ChatService {
    constructor() {
        this.messages = [];
        this.currentStage = CONFIG.COUNSELING_STAGES.INITIAL;
        this.emotionHistory = [];
        this.lastMessageTime = null;
        
        // 关键词匹配规则
        this.stageKeywords = {
            [CONFIG.COUNSELING_STAGES.ASSESSMENT]: [
                '困扰', '问题', '感受', '经历', '发生了什么',
                '多久了', '影响', '症状', '原因'
            ],
            [CONFIG.COUNSELING_STAGES.GOAL_SETTING]: [
                '目标', '期望', '希望', '改变', '计划',
                '想要', '达到', '实现'
            ],
            [CONFIG.COUNSELING_STAGES.INTERVENTION]: [
                '建议', '方法', '策略', '技巧', '尝试',
                '练习', '帮助', '解决'
            ],
            [CONFIG.COUNSELING_STAGES.CLOSING]: [
                '总结', '回顾', '进展', '改善', '结束',
                '再见', '谢谢', '再会'
            ]
        };

        // 情绪词典
        this.emotionKeywords = {
            positive: [
                '开心', '快乐', '高兴', '满意', '期待',
                '希望', '感激', '放松', '平静', '温暖'
            ],
            negative: [
                '难过', '伤心', '焦虑', '烦恼', '痛苦',
                '压力', '沮丧', '失望', '害怕', '生气'
            ],
            neutral: [
                '一般', '还好', '普通', '正常', '一样',
                '不确定', '可能', '也许', '思考', '考虑'
            ]
        };
    }

    // 发送消息到Deepseek API
    async sendMessage(message) {
        try {
            // 记录消息发送时间
            const currentTime = new Date();
            const timeDiff = this.lastMessageTime ? 
                (currentTime - this.lastMessageTime) / 1000 : 0;
            this.lastMessageTime = currentTime;

            // 添加用户消息到历史记录
            this.messages.push({
                role: 'user',
                content: message
            });

            // 分析情绪
            const emotion = this.analyzeEmotion(message);
            this.emotionHistory.push(emotion);

            // 检查是否需要更新阶段
            this.updateStage(message, timeDiff);

            // 构建系统消息
            const systemMessage = this.buildSystemMessage();

            // 准备请求数据
            const requestData = {
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: systemMessage
                    },
                    ...this.messages
                ],
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            };

            // 发送请求到Deepseek API
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.API_KEY}`
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error('API请求失败');
            }

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;

            // 添加AI回复到历史记录
            this.messages.push({
                role: 'assistant',
                content: aiResponse
            });

            return aiResponse;

        } catch (error) {
            console.error('发送消息失败:', error);
            throw error;
        }
    }

    // 构建系统消息
    buildSystemMessage() {
        const basePrompt = CONFIG.SYSTEM_PROMPT;
        const stagePrompt = CONFIG.STAGE_PROMPTS[this.currentStage];
        const emotionContext = this.getEmotionContext();
        
        return `${basePrompt}\n\n当前阶段：${stagePrompt}\n\n情绪背景：${emotionContext}`;
    }

    // 获取情绪背景信息
    getEmotionContext() {
        if (this.emotionHistory.length === 0) {
            return '尚未进行情绪评估';
        }

        const recentEmotions = this.emotionHistory.slice(-3);
        const emotionTrend = this.analyzeEmotionTrend(recentEmotions);
        
        return `用户最近的情绪趋势：${emotionTrend}`;
    }

    // 分析情绪趋势
    analyzeEmotionTrend(emotions) {
        if (emotions.length < 2) {
            return '情绪数据不足以分析趋势';
        }

        const emotionValues = {
            'positive': 1,
            'neutral': 0,
            'negative': -1
        };

        const values = emotions.map(e => emotionValues[e]);
        const trend = values[values.length - 1] - values[0];

        if (trend > 0) {
            return '情绪逐渐转好';
        } else if (trend < 0) {
            return '情绪有所下降';
        } else {
            return '情绪基本稳定';
        }
    }

    // 分析文本情绪
    analyzeEmotion(text) {
        let scores = {
            positive: 0,
            negative: 0,
            neutral: 0
        };

        // 对每个情绪类别进行关键词匹配
        Object.entries(this.emotionKeywords).forEach(([emotion, keywords]) => {
            keywords.forEach(keyword => {
                const regex = new RegExp(keyword, 'g');
                const matches = (text.match(regex) || []).length;
                scores[emotion] += matches;
            });
        });

        // 找出得分最高的情绪
        return Object.entries(scores).reduce((a, b) => 
            scores[a] > scores[b[0]] ? a : b[0], 'neutral');
    }

    // 更新咨询阶段
    updateStage(message, timeDiff) {
        // 如果对话时间超过30分钟，考虑进入总结阶段
        if (timeDiff > 1800) {
            this.currentStage = CONFIG.COUNSELING_STAGES.CLOSING;
            return;
        }

        // 统计当前消息中各阶段关键词出现次数
        const stageScores = {};
        Object.entries(this.stageKeywords).forEach(([stage, keywords]) => {
            stageScores[stage] = keywords.reduce((count, keyword) => {
                const regex = new RegExp(keyword, 'g');
                return count + (message.match(regex) || []).length;
            }, 0);
        });

        // 获取当前阶段索引
        const stages = Object.values(CONFIG.COUNSELING_STAGES);
        const currentIndex = stages.indexOf(this.currentStage);

        // 如果下一阶段的关键词出现3次以上，考虑进入下一阶段
        if (currentIndex < stages.length - 1) {
            const nextStage = stages[currentIndex + 1];
            if (stageScores[nextStage] >= 3) {
                this.currentStage = nextStage;
            }
        }

        // 检查情绪变化
        const recentEmotions = this.emotionHistory.slice(-3);
        if (recentEmotions.length >= 3) {
            const allNegative = recentEmotions.every(e => e === 'negative');
            if (allNegative && this.currentStage === CONFIG.COUNSELING_STAGES.INITIAL) {
                // 如果连续出现负面情绪，快速进入评估阶段
                this.currentStage = CONFIG.COUNSELING_STAGES.ASSESSMENT;
            }
        }
    }

    // 获取当前阶段
    getCurrentStage() {
        return this.currentStage;
    }

    // 导出聊天记录
    exportHistory() {
        const history = this.messages.map(msg => {
            const role = msg.role === 'user' ? '用户' : 'AI咨询师';
            return `${role}：${msg.content}\n`;
        }).join('\n');

        const blob = new Blob([history], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `心理咨询记录_${new Date().toLocaleDateString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 清除聊天记录
    clearHistory() {
        this.messages = [];
        this.currentStage = CONFIG.COUNSELING_STAGES.INITIAL;
        this.emotionHistory = [];
        this.lastMessageTime = null;
    }
} 