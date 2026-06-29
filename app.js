const STORAGE_KEY = "mon-portail-artiste-chat-fr-v2";
// URL du service de publication (Cloudflare Worker). À renseigner après déploiement,
// ex. "https://mon-portail-artiste-publish.VOTRE-SOUS-DOMAINE.workers.dev".
// Laisser vide désactive le bouton « Publier » (le reste de l'app fonctionne).
const PUBLISH_ENDPOINT = "https://mon-portail-artiste-publish.artiste-personnalise.workers.dev";
const IDB_NAME = "mon-portail-artiste-db";
const IDB_STORE = "kv";
const IMAGES_KEY = "images";
const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  messages: [],
  draft: null,
  images: [],
  audience: [],
  works: [],
  palette: null,
  paletteIntensity: 0.35,
  person: "third",
  profession: "artiste",
  layout: "editorial",
  fontTitle: "default",
  fontBody: "default",
  shareUrl: "",
  pageStyle: "minimal",
  motionStyle: "subtle",
  listening: false,
  recognition: null,
  guided: { active: false, step: 0 },
  guidedAnswers: {},
  extra: "",
  speak: false
};

const GUIDED_QUESTIONS = [
  { key: "name", q: "guided.q.name" },
  { key: "location", q: "guided.q.location" },
  { key: "practice", q: "guided.q.practice" },
  { key: "themes", q: "guided.q.themes" },
  { key: "works", q: "guided.q.works" },
  { key: "extra", q: "__extra__" },
  { key: "audience", q: "guided.q.audience" },
  { key: "goals", q: "guided.q.goals" },
  { key: "contact", q: "guided.q.contact" }
];

const GUIDED_ACK = ["guided.ack1", "guided.ack2", "guided.ack3"];

const FONTS = {
  default: { stack: null },
  marianne: { stack: '"Marianne", ui-sans-serif, system-ui, sans-serif' },
  georgia: { stack: 'Georgia, "Times New Roman", serif' },
  times: { stack: '"Times New Roman", Times, serif' },
  helvetica: { stack: '"Helvetica Neue", Arial, sans-serif' },
  courier: { stack: '"Courier New", Courier, monospace' },
  playfair: { stack: '"Playfair Display", Georgia, serif', google: "Playfair+Display:wght@400;600;700" },
  space: { stack: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif', google: "Space+Grotesk:wght@400;500;700" },
  dmserif: { stack: '"DM Serif Display", Georgia, serif', google: "DM+Serif+Display" },
  syne: { stack: '"Syne", ui-sans-serif, system-ui, sans-serif', google: "Syne:wght@400;600;800" },
  abril: { stack: '"Abril Fatface", Georgia, serif', google: "Abril+Fatface" },
  cormorant: { stack: '"Cormorant Garamond", Georgia, serif', google: "Cormorant+Garamond:wght@400;500;600;700" },
  bodoni: { stack: '"Bodoni Moda", Georgia, serif', google: "Bodoni+Moda:wght@400;500;700" },
  caveat: { stack: '"Caveat", "Segoe Script", cursive', google: "Caveat:wght@400;700" },
  bricolage: { stack: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif', google: "Bricolage+Grotesque:wght@400;600;800" }
};

function ensureFontLoaded(id) {
  const font = FONTS[id];
  if (!font || !font.google) return;
  const linkId = `gfont-${id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.append(link);
}

function applyFonts() {
  const title = FONTS[state.fontTitle] || FONTS.default;
  const body = FONTS[state.fontBody] || FONTS.default;
  ensureFontLoaded(state.fontTitle);
  ensureFontLoaded(state.fontBody);
  if (title.stack) preview.style.setProperty("--portal-font-title", title.stack);
  else preview.style.removeProperty("--portal-font-title");
  if (body.stack) preview.style.setProperty("--portal-font-body", body.stack);
  else preview.style.removeProperty("--portal-font-body");
}

function updateFonts() {
  state.fontTitle = $("#titleFont").value;
  state.fontBody = $("#bodyFont").value;
  applyPreviewDesign();
  persist();
  setStatus(t("status.fontApplied"));
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const chatLog = $("#chatLog");
const messageInput = $("#artistMessage");
const preview = $("#portalPreview");
const statusBox = $("#statusBox");

const STYLE_VALUES = ["minimal", "gallery", "editorial", "dark"];
const LANG_KEY = "mpa-lang";
let currentLang = "fr";
const FR = {};
let activeEditable = null;
let draggedModuleId = null;
let textToolbarHideTimer = null;
let textToolbarPointerInside = false;
let moduleAutoScrollFrame = null;
let moduleAutoScrollSpeed = 0;

const I18N = {
  en: {
    skip: "Skip to main content",
    "brand.tagline": "Unofficial prototype · public-service inspired",
    "nav.create": "Create", "nav.uses": "Uses", "nav.trust": "Trust", "nav.research": "Research",
    "studio.chip": "Digital support · Performing-arts professionals",
    "studio.eyebrow": "Describe your role: an assistant helps you structure your page",
    "studio.title": "A simple exchange to create your professional portal",
    "label.profession": "Your role", "prof.artiste": "Artist", "prof.technicien": "Performing-arts technician", "prof.gestion": "Administration / production",
    "status.professionApplied": "Role updated: the page was regenerated.", "status.professionSaved": "Role saved. It will be applied when you create the page.",
    "extra.artiste.label": "Training & awards (optional)", "extra.artiste.q": "Do you have any training, awards or residencies to highlight?",
    "extra.technicien.label": "Certifications & licences (optional)", "extra.technicien.q": "Which certifications or licences do you hold? (rigging, electrical, first-aid, driving…)",
    "extra.gestion.label": "Organisations & budgets (optional)", "extra.gestion.q": "Which organisations have you worked with, and which budgets or projects have you managed?",
    "seo.hint": "(meta — not shown publicly)",
    "share.instantLabel": "Link to share — no hosting needed", "share.instantBtn": "Copy shareable link",
    "share.instantNote": "This link opens your page directly in the browser. Perfect to send by message or email.",
    "share.publicLabel": "Public link (if you host the page yourself)",
    "share.copied": "Link copied! Paste it anywhere — it opens your page directly.",
    "share.copiedNoImg": "Link copied! Uploaded photos aren't included (link too long); text and style are. For a page with photos, use \"Export HTML\".",
    "share.needPage": "Create your page first, then copy the shareable link.",
    "share.publishNote": "Publish your page with its images, then immediately get a link to share.",
    "share.retentionNote": "The published page includes your images. The link remains available for 90 days.",
    "publish.btn": "Copy my page link", "publish.inProgress": "Creating the link…", "publish.done": "Your page is online! The link, including your images, has been copied.", "publish.failed": "Publishing failed:", "publish.needPage": "Create your page first, then copy its link.", "publish.notConfigured": "The publishing service is not configured yet.",
    "studio.intro": "Go at your own pace: tell us about your background, your works, your goals. The assistant prepares a clear draft — generated locally in your browser by default — that you can review, edit and export.",
    "hero.problem": "Today, many performing-arts professionals only exist online through social networks and their algorithms. A personal portal gives you back a stable space of your own to show your work.",
    "trust.unofficial": "Unofficial", "trust.rgaa": "RGAA accessibility", "trust.human": "Human validation", "trust.export": "Exportable",
    "step.tell": "Tell us about your practice", "step.create": "Create your page", "step.verify": "Review and export",
    "chat.eyebrow": "Step 1 · Conversation", "chat.title": "Talk about your work",
    "label.message": "Tell us what you want to highlight",
    "composer.enterHint": "Enter to send · Shift+Enter for a new line", "composer.send": "Send ➤",
    "composer.send": "Send",
    "placeholder.message": "Example: My name is Lina Moreau, performer based in Marseille. I work in theatre and dance. I've toured with several companies and would like this page to address venues, festivals and producers.",
    "label.voiceLang": "Dictation language",
    "voicelang.fr": "French", "voicelang.zh": "Mandarin Chinese", "voicelang.en": "English",
    "btn.dictate": "Dictate",
    "label.pageStyle": "Page style",
    "style.minimal": "Clean & professional", "style.gallery": "Gallery portfolio", "style.editorial": "Art review", "style.dark": "Immersive dark",
    "label.motion": "Animation",
    "motion.none": "No animation", "motion.subtle": "Soft transitions", "motion.dynamic": "Exhibition effect",
    "audience.legend": "Who is your page for? (optional)",
    "audience.curators": "Curators", "audience.galleries": "Galleries", "audience.residencies": "Residencies", "audience.institutions": "Institutions", "audience.collectors": "Collectors", "audience.public": "General public",
    "label.upload": "Add a few images of your works, if you wish",
    "btn.sample": "See an example", "btn.advice": "Ask for advice",
    "advanced.summary": "Advanced option: connect an AI model",
    "advanced.label": "Proxy endpoint for the AI model",
    "advanced.note": "For a real deployment, use a secure intermediary server. Never put an API key directly in this page.",
    "status.default": "You can start with a few sentences, or use the example to try it out.",
    "preview.eyebrow": "Step 2 · Preview", "preview.title": "Preview of your page",
    "btn.exportHtml": "Export HTML", "btn.exportJson": "Export JSON", "btn.print": "Print",
    "review.title": "Before publishing", "review.accurate": "The background information is accurate.", "review.rights": "The images may be used.", "review.proof": "The text has been reviewed or adjusted by the artist.",
    "btn.clear": "Erase local content",
    "uses.eyebrow": "What it's for", "uses.title": "What your portal lets you do",
    "uses.apply.title": "Apply", "uses.apply.text": "Apply to residencies, open calls and exhibitions with an up-to-date, clear page ready to share.",
    "uses.present.title": "Present", "uses.present.text": "Bring together a readable press kit — statement, works, background and contact — exportable as HTML or printable in one click.",
    "uses.gather.title": "Gather", "uses.gather.text": "Centralise your works, links and contacts at a single address, independent of social platforms.",
    "compliance.eyebrow": "Public-service stance", "compliance.title": "Guideposts to create with confidence",
    "compliance.c1t": "Not a selection tool", "compliance.c1p": "The prototype only helps present an artistic background. It does not rank people and makes no automatic decision.",
    "compliance.c2t": "Validation by the artist", "compliance.c2p": "Every generated text remains editable. Before publishing, the artist keeps control over facts, tone and images.",
    "compliance.c3t": "Data and image rights", "compliance.c3p": "The prototype saves locally. A real service must provide information, export, deletion and rights confirmation.",
    "compliance.c4t": "Accessibility", "compliance.c4p": "The page uses a readable structure, keyboard-accessible controls, visible focus and alternative text.",
    "research.eyebrow": "Research framework", "research.title": "Why a personal portal?",
    "research.text": "A personal portal can become a professional identity infrastructure: it brings together works, background and contacts, while reducing dependence on social platforms and their algorithms.",
    "empty.title": "Your page will appear here", "empty.text": "Write a few sentences, or try the example, then create your page.",
    "btn.create": "Create my page", "btn.regenerate": "Regenerate the page",
    "voice.stop": "Stop dictation", "voice.available": "Dictation available", "voice.unavailable": "Dictation unavailable",
    "palette.label": "Page colours", "palette.bg": "Background", "palette.accent": "Accent", "palette.intensity": "Background intensity",
    "palette.generate": "Generate a background", "palette.reset": "Reset",
    "palette.sable": "Sand", "palette.ocean": "Ocean", "palette.foret": "Forest", "palette.encre": "Ink", "palette.rose": "Powder pink", "palette.nuit": "Night",
    "palette.applied": "Colour palette applied.", "palette.cleared": "Colours reset.",
    "btn.clearInput": "Clear input", "status.inputCleared": "The input field has been cleared.", "status.inputEmpty": "The input field is already empty.",
    "chat.greeting": "Hello, I'll help you turn your words into a personal page. You can start simply: who you are, what you create, what your works are about, and who you want to present your work to.",
    "msg.edit": "Edit", "msg.delete": "Delete", "msg.save": "Save", "msg.cancel": "Cancel",
    "msg.deleteConfirm": "Delete this message?", "msg.deleted": "Message deleted.", "msg.updated": "Message updated.", "msg.emptyEdit": "The message can't be empty.",
    "label.person": "Text voice", "person.third": "Third person (by name)", "person.first": "First person (I)",
    "label.layout": "Layout", "layout.editorial": "Editorial / magazine", "layout.standard": "Columns (standard)", "layout.centre": "Centered single column", "layout.affiche": "Poster (giant title)", "layout.mosaique": "Masonry", "layout.defilement": "Horizontal scroll",
    "status.personApplied": "The text voice has been updated in the preview.", "status.personSaved": "The text voice will be applied the next time you create the page.",
    "works.legend": "Your work — pieces, shows, productions (optional)", "works.add": "+ Add a work", "works.title": "Title", "works.year": "Year", "works.medium": "Medium / role", "works.description": "Free description", "works.remove": "Remove this work",
    "guided.start": "Guided conversation", "guided.stop": "Leave guided mode", "guided.speak": "Read questions aloud",
    "guided.intro": "With pleasure! Let's take it gently, one question at a time. You can answer by typing or by speaking (the \"Dictate\" button).",
    "guided.q.name": "To begin, what's your name, or the artist name you use?",
    "guided.q.location": "Where are you currently based?",
    "guided.q.practice": "What is your speciality or exact role? (e.g. actor, dance, sound, lighting, production…)",
    "guided.q.themes": "On what kinds of projects, or in which fields, do you mostly work?",
    "guided.q.works": "Name one or two key projects (show, production…), ideally with the title, year and your role or the venue.",
    "guided.q.audience": "Who would you like to show this page to?",
    "guided.q.goals": "What would you like to achieve with this portal?",
    "guided.q.contact": "Finally, which contact address would you like to display?",
    "guided.ack1": "Great, noted!", "guided.ack2": "Thanks, very clear.", "guided.ack3": "Perfect.",
    "guided.done": "Thank you, I have everything I need to prepare a nice page. Click \"Create my page\" whenever you like.",
    "status.guidedStarted": "Conversation mode: answer at your own pace, by typing or speaking.",
    "status.guidedStopped": "Conversation mode stopped. You can continue freely.",
    "status.voiceAutoSend": "Answer sent. Listening for the next one…",
    "label.titleFont": "Heading font", "label.bodyFont": "Body font", "font.default": "Match the style", "status.fontApplied": "Fonts updated."
  },
  zh: {
    skip: "跳到主要内容",
    "brand.tagline": "非官方原型 · 受公共服务启发",
    "nav.create": "创建", "nav.uses": "用途", "nav.trust": "信任", "nav.research": "研究",
    "studio.chip": "数字支持 · 演艺从业者",
    "studio.eyebrow": "描述你的职业:助手帮你梳理页面结构",
    "studio.title": "通过简单对话创建你的职业门户",
    "label.profession": "你的职业", "prof.artiste": "艺术家", "prof.technicien": "演出技术人员", "prof.gestion": "行政 / 制作",
    "status.professionApplied": "职业已更新:页面已重新生成。", "status.professionSaved": "职业已保存,将在创建页面时应用。",
    "extra.artiste.label": "教育背景与获奖(可选)", "extra.artiste.q": "你有哪些值得展示的教育背景、奖项或驻地经历?",
    "extra.technicien.label": "资质与认证(可选)", "extra.technicien.q": "你持有哪些资质或认证?(高空作业、电工、消防、驾照……)",
    "extra.gestion.label": "机构与预算(可选)", "extra.gestion.q": "你与哪些机构合作过,管理过哪些预算或项目?",
    "seo.hint": "(元信息 · 不公开显示)",
    "share.instantLabel": "可分享链接 — 无需任何托管", "share.instantBtn": "复制可分享链接",
    "share.instantNote": "此链接直接在浏览器中打开你的页面。适合用消息或邮件发送。",
    "share.publicLabel": "公开链接(如果你自己托管页面)",
    "share.copied": "链接已复制!粘贴到任何地方都能直接打开你的页面。",
    "share.copiedNoImg": "链接已复制!上传的照片未包含(链接过长),但文本和样式已包含。需要带照片的页面请用“导出 HTML”。",
    "share.needPage": "请先创建页面,再复制可分享链接。",
    "share.publishNote": "发布包含图片的个人页面，并立即获得可分享链接。",
    "share.retentionNote": "发布的页面会包含你的图片，链接有效期为 90 天。",
    "publish.btn": "复制个人网页链接", "publish.inProgress": "正在生成链接……", "publish.done": "个人网页已发布，包含图片的链接已复制。", "publish.failed": "发布失败:", "publish.needPage": "请先创建个人页面，再复制链接。", "publish.notConfigured": "发布服务尚未配置。",
    "studio.intro": "按自己的节奏来:讲讲你的经历、作品和愿望。助手会准备一份清晰的草稿——默认在你的浏览器本地生成——你可以审阅、修改并导出。",
    "hero.problem": "如今,许多演艺从业者只能通过社交网络及其算法在线“存在”。一个个人门户让你重新拥有一个属于自己的稳定空间来展示作品。",
    "trust.unofficial": "非官方", "trust.rgaa": "RGAA 无障碍", "trust.human": "人工审核", "trust.export": "可导出",
    "step.tell": "讲述你的创作", "step.create": "创建页面", "step.verify": "检查并导出",
    "chat.eyebrow": "第 1 步 · 对话", "chat.title": "谈谈你的作品",
    "label.message": "说说你想重点呈现什么",
    "composer.enterHint": "回车发送 · Shift+回车换行", "composer.send": "发送 ➤",
    "composer.send": "发送",
    "placeholder.message": "示例:我叫 Lina Moreau,是马赛的一位视觉艺术家。我从事绘画、摄影和纺织装置。我的作品关注家庭记忆、城市生态与日常物件。我希望这个页面面向策展人、画廊、驻地项目和文化机构。",
    "label.voiceLang": "听写语言",
    "voicelang.fr": "法语", "voicelang.zh": "普通话", "voicelang.en": "英语",
    "btn.dictate": "听写",
    "label.pageStyle": "页面风格",
    "style.minimal": "简洁专业", "style.gallery": "画廊作品集", "style.editorial": "艺术评论", "style.dark": "沉浸暗色",
    "label.motion": "动画",
    "motion.none": "无动画", "motion.subtle": "柔和过渡", "motion.dynamic": "展览效果",
    "audience.legend": "你的页面面向谁?(可选)",
    "audience.curators": "策展人", "audience.galleries": "画廊", "audience.residencies": "驻地项目", "audience.institutions": "机构", "audience.collectors": "收藏家", "audience.public": "大众",
    "label.upload": "如果愿意,可添加几张作品图片",
    "btn.sample": "查看示例", "btn.advice": "请求建议",
    "advanced.summary": "高级选项:连接 AI 模型",
    "advanced.label": "AI 模型的代理端点",
    "advanced.note": "实际部署时,请使用安全的中间服务器。切勿在此页面中直接放置 API 密钥。",
    "status.default": "你可以先写几句话,或使用示例来体验。",
    "preview.eyebrow": "第 2 步 · 预览", "preview.title": "页面预览",
    "btn.exportHtml": "导出 HTML", "btn.exportJson": "导出 JSON", "btn.print": "打印",
    "review.title": "发布前确认", "review.accurate": "履历信息准确无误。", "review.rights": "图片可以使用。", "review.proof": "文本已由艺术家审阅或调整。",
    "btn.clear": "清除本地内容",
    "uses.eyebrow": "有什么用", "uses.title": "你的门户能帮你做什么",
    "uses.apply.title": "申请", "uses.apply.text": "用一份及时、清晰、随时可分享的页面申请驻地、项目征集和展览。",
    "uses.present.title": "呈现", "uses.present.text": "汇集一份易读的新闻资料包——自述、作品、履历和联系方式——一键导出为 HTML 或打印。",
    "uses.gather.title": "汇聚", "uses.gather.text": "把你的作品、链接和联系方式集中到一个地址,独立于社交平台。",
    "compliance.eyebrow": "公共服务立场", "compliance.title": "让你安心创作的准则",
    "compliance.c1t": "不是筛选工具", "compliance.c1p": "该原型仅帮助呈现艺术履历。它不对人进行排名,也不做任何自动决策。",
    "compliance.c2t": "由艺术家确认", "compliance.c2p": "每段生成的文本都可修改。发布前,艺术家始终掌控事实、语气和图片。",
    "compliance.c3t": "数据与图片权利", "compliance.c3p": "该原型在本地保存。真正的服务需要提供信息告知、导出、删除和权利确认。",
    "compliance.c4t": "无障碍", "compliance.c4p": "页面采用清晰的结构、可用键盘操作的控件、可见的焦点和替代文本。",
    "research.eyebrow": "研究框架", "research.title": "为什么需要个人门户?",
    "research.text": "个人门户可以成为一种职业身份基础设施:它汇集作品、履历和联系方式,同时减少对社交平台及其算法的依赖。",
    "empty.title": "你的页面将显示在这里", "empty.text": "写几句话,或试试示例,然后创建你的页面。",
    "btn.create": "创建我的页面", "btn.regenerate": "重新生成页面",
    "voice.stop": "停止听写", "voice.available": "可用听写", "voice.unavailable": "听写不可用",
    "palette.label": "页面配色", "palette.bg": "背景", "palette.accent": "强调色", "palette.intensity": "背景强度",
    "palette.generate": "生成背景", "palette.reset": "重置",
    "palette.sable": "沙色", "palette.ocean": "海洋", "palette.foret": "森林", "palette.encre": "墨色", "palette.rose": "粉彩", "palette.nuit": "夜色",
    "palette.applied": "已应用配色。", "palette.cleared": "配色已重置。",
    "btn.clearInput": "清除输入", "status.inputCleared": "输入框已清空。", "status.inputEmpty": "输入框本来就是空的。",
    "chat.greeting": "你好,我会帮你把文字变成一个个人页面。你可以从简单开始:你是谁、你创作什么、你的作品讲述了什么,以及你想把作品展示给谁。",
    "msg.edit": "修改", "msg.delete": "删除", "msg.save": "保存", "msg.cancel": "取消",
    "msg.deleteConfirm": "删除这条消息?", "msg.deleted": "消息已删除。", "msg.updated": "消息已修改。", "msg.emptyEdit": "消息不能为空。",
    "label.person": "文本人称", "person.third": "第三人称(用名字)", "person.first": "第一人称(我)",
    "label.layout": "版面布局", "layout.editorial": "杂志 / 编辑风", "layout.standard": "分栏(标准)", "layout.centre": "居中单栏", "layout.affiche": "海报(超大标题)", "layout.mosaique": "瀑布流", "layout.defilement": "横向滚动",
    "status.personApplied": "预览中的文本人称已更新。", "status.personSaved": "文本人称将在下次创建页面时应用。",
    "works.legend": "你的作品/项目——作品、演出、制作(可选)", "works.add": "+ 添加", "works.title": "标题", "works.year": "年份", "works.medium": "媒介 / 角色", "works.description": "自由描述", "works.remove": "删除",
    "guided.start": "引导式对话", "guided.stop": "退出引导模式", "guided.speak": "朗读问题",
    "guided.intro": "很乐意!我们慢慢来,一次一个问题。你可以打字回答,也可以说话(点“听写”)。",
    "guided.q.name": "先来认识一下,你叫什么名字,或者你用的艺名是?",
    "guided.q.location": "你目前在哪里工作生活?",
    "guided.q.practice": "你的专长或具体职业是?(如演员、舞蹈、音响、灯光、制作……)",
    "guided.q.themes": "你主要参与哪些类型的项目,或在哪些领域工作?",
    "guided.q.works": "请举一到两个重要项目(演出、制作……),尽量写上名称、年份以及你的角色或地点。",
    "guided.q.audience": "你希望把这个页面展示给谁?",
    "guided.q.goals": "你希望通过这个门户达成什么?",
    "guided.q.contact": "最后,你想展示哪个联系方式?",
    "guided.ack1": "很好,记下了!", "guided.ack2": "谢谢,很清楚。", "guided.ack3": "完美。",
    "guided.done": "非常感谢,我已经有足够的内容来准备一个漂亮的页面了。随时点“创建我的页面”。",
    "status.guidedStarted": "对话模式:按自己的节奏回答,可以打字或说话。",
    "status.guidedStopped": "已退出对话模式。你可以自由继续。",
    "status.voiceAutoSend": "回答已发送。我在听你说下一个……",
    "label.titleFont": "标题字体", "label.bodyFont": "正文字体", "font.default": "跟随风格", "status.fontApplied": "字体已更新。"
  }
};

function captureFrench() {
  $$("[data-i18n]").forEach((node) => {
    FR[node.dataset.i18n] = node.textContent.trim();
  });
  $$("[data-i18n-ph]").forEach((node) => {
    FR[node.dataset.i18nPh] = node.getAttribute("placeholder");
  });
  Object.assign(FR, {
    "btn.create": "Créer ma page",
    "btn.regenerate": "Regénérer la page",
    "voice.stop": "Arrêter la dictée",
    "voice.available": "Dictée disponible",
    "voice.unavailable": "Dictée indisponible",
    "empty.title": "Votre page apparaîtra ici",
    "empty.text": "Écrivez quelques phrases, ou essayez avec l'exemple, puis créez votre page.",
    "palette.sable": "Sable",
    "palette.ocean": "Océan",
    "palette.foret": "Forêt",
    "palette.encre": "Encre",
    "palette.rose": "Rose poudré",
    "palette.nuit": "Nuit",
    "palette.applied": "Palette de couleurs appliquée.",
    "palette.cleared": "Couleurs réinitialisées.",
    "status.inputCleared": "Le champ de saisie a été vidé.",
    "status.inputEmpty": "Le champ de saisie est déjà vide.",
    "chat.greeting": "Bonjour, je vais vous aider à transformer vos mots en page personnelle. Vous pouvez commencer simplement : qui vous êtes, ce que vous créez, ce que vos œuvres racontent, et à qui vous souhaitez présenter votre travail.",
    "msg.edit": "Modifier",
    "msg.delete": "Supprimer",
    "msg.save": "Enregistrer",
    "msg.cancel": "Annuler",
    "msg.deleteConfirm": "Supprimer ce message ?",
    "msg.deleted": "Message supprimé.",
    "msg.updated": "Message modifié.",
    "msg.emptyEdit": "Le message ne peut pas être vide.",
    "status.personApplied": "La voix du texte a été mise à jour dans l'aperçu.",
    "status.personSaved": "La voix du texte sera appliquée à la prochaine création de page.",
    "works.title": "Titre",
    "works.year": "Année",
    "works.medium": "Médium",
    "works.description": "Description libre de l'œuvre",
    "works.remove": "Supprimer cette œuvre",
    "guided.start": "Conversation guidée",
    "guided.stop": "Quitter le mode guidé",
    "guided.speak": "Lire les questions à voix haute",
    "guided.intro": "Avec plaisir ! On y va doucement, une question à la fois. Vous pouvez répondre en écrivant ou en parlant (bouton « Dicter »).",
    "guided.q.name": "Pour commencer, comment vous appelez-vous, ou quel nom d'artiste utilisez-vous ?",
    "guided.q.location": "Où êtes-vous basé·e en ce moment ?",
    "guided.q.practice": "Quelle est votre spécialité ou votre métier précis ? (ex. comédien·ne, danse, son, lumière, production…)",
    "guided.q.themes": "Sur quels types de projets ou dans quels domaines intervenez-vous le plus ?",
    "guided.q.works": "Citez un ou deux projets marquants (spectacle, production…), avec si possible le titre, l'année et votre rôle ou le lieu.",
    "guided.q.audience": "À qui aimeriez-vous montrer cette page ?",
    "guided.q.goals": "Qu'aimeriez-vous obtenir grâce à ce portail ?",
    "guided.q.contact": "Pour finir, quelle adresse de contact souhaitez-vous afficher ?",
    "guided.ack1": "Super, c'est noté !",
    "guided.ack2": "Merci, très clair.",
    "guided.ack3": "Parfait.",
    "guided.done": "Merci beaucoup, j'ai tout ce qu'il faut pour préparer une belle page. Cliquez sur « Créer ma page » quand vous voulez.",
    "status.guidedStarted": "Mode conversation : répondez à votre rythme, en écrivant ou en parlant.",
    "status.guidedStopped": "Mode conversation arrêté. Vous pouvez continuer librement.",
    "status.voiceAutoSend": "Réponse envoyée. Je vous écoute pour la suite…",
    "label.titleFont": "Police des titres",
    "label.bodyFont": "Police du texte",
    "font.default": "Selon le style",
    "status.fontApplied": "Polices mises à jour.",
    "status.professionApplied": "Métier mis à jour : la page a été régénérée.",
    "status.professionSaved": "Métier enregistré. Il sera appliqué à la création de la page.",
    "extra.artiste.label": "Formation & distinctions (optionnel)",
    "extra.artiste.q": "Avez-vous des formations, prix ou résidences à mettre en avant ?",
    "extra.technicien.label": "Habilitations & certifications (optionnel)",
    "extra.technicien.q": "Quelles habilitations ou certifications avez-vous ? (CACES, habilitation électrique, SSIAP, permis…)",
    "extra.gestion.label": "Structures & budgets (optionnel)",
    "extra.gestion.q": "Avec quelles structures avez-vous travaillé, et quels budgets ou projets avez-vous gérés ?",
    "seo.hint": "(méta — non affiché publiquement)",
    "share.instantLabel": "Lien à partager — aucun hébergement nécessaire",
    "share.instantBtn": "Copier le lien partageable",
    "share.instantNote": "Ce lien ouvre votre page directement dans le navigateur. Parfait pour l'envoyer par message ou mail.",
    "share.publicLabel": "Lien public (si vous hébergez la page vous-même)",
    "share.copied": "Lien copié ! Collez-le n'importe où : il ouvre votre page directement.",
    "share.copiedNoImg": "Lien copié ! Les photos importées ne sont pas incluses (lien trop long) ; les textes et le style le sont. Pour une page avec photos, utilisez « Exporter HTML ».",
    "share.needPage": "Créez d'abord votre page, puis copiez le lien partageable.",
    "share.publishNote": "Publiez votre page avec ses images, puis récupérez immédiatement un lien à partager.",
    "share.retentionNote": "La page publiée inclut vos images. Le lien reste disponible pendant 90 jours.",
    "publish.btn": "Copier le lien de ma page",
    "publish.inProgress": "Création du lien…",
    "publish.done": "Votre page est en ligne ! Le lien, avec vos images, a été copié.",
    "publish.failed": "La publication a échoué :",
    "publish.needPage": "Créez d'abord votre page, puis copiez son lien.",
    "publish.notConfigured": "Le service de publication n'est pas encore configuré."
  });
}

function t(key) {
  if (currentLang === "fr") return FR[key] ?? key;
  return (I18N[currentLang] && I18N[currentLang][key]) || FR[key] || key;
}

function translateTree(root) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-ph]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPh));
  });
}

function applyLanguage(lang) {
  currentLang = I18N[lang] || lang === "fr" ? lang : "fr";
  document.documentElement.lang = currentLang;
  const select = $("#langSwitch");
  if (select) select.value = currentLang;
  translateTree(document);
  updateGenerateLabel();
  refreshVoiceBadge();
  const voiceBtn = $("#voiceBtn");
  if (voiceBtn) voiceBtn.textContent = state.listening ? t("voice.stop") : t("btn.dictate");
  const guidedBtn = $("#guidedBtn");
  if (guidedBtn) guidedBtn.textContent = state.guided.active ? t("guided.stop") : t("guided.start");
  renderStyleGallery();
  renderPaletteSwatches();
  renderWorksInput();
  renderMessages();
  syncExtraLabel();
  try {
    localStorage.setItem(LANG_KEY, currentLang);
  } catch {
    // ignore
  }
}

function refreshVoiceBadge() {
  const badge = $("#voiceBadge");
  if (!badge) return;
  badge.textContent = SpeechRecognitionApi ? t("voice.available") : t("voice.unavailable");
}

function renderStyleGallery() {
  const gallery = $("#styleGallery");
  if (!gallery) return;
  gallery.innerHTML = STYLE_VALUES.map(
    (value) => `
      <button type="button" class="style-card style-card-${value}${state.pageStyle === value ? " active" : ""}" data-style="${value}" aria-pressed="${state.pageStyle === value}">
        <span class="style-card-preview" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="style-card-label">${escapeHtml(t(`style.${value}`))}</span>
      </button>`
  ).join("");

  $$("#styleGallery .style-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.pageStyle = button.dataset.style;
      $("#pageStyle").value = state.pageStyle;
      applyPreviewDesign();
      renderStyleGallery();
      persist();
      setStatus(`${t("label.pageStyle")} : ${t(`style.${state.pageStyle}`)}`);
    });
  });
}

const PALETTE_PRESETS = [
  { key: "sable", bg: "#f6efe2", accent: "#b06a3b" },
  { key: "ocean", bg: "#eef4f7", accent: "#1d6f8b" },
  { key: "foret", bg: "#eef3ec", accent: "#2d6b52" },
  { key: "encre", bg: "#f2f3f6", accent: "#000091" },
  { key: "rose", bg: "#faeef0", accent: "#b8495b" },
  { key: "nuit", bg: "#14181c", accent: "#f3cf5a" }
];

function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}

function rgbToHex(r, g, b) {
  const channel = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

function buildPalette(bg, accent, intensity = state.paletteIntensity) {
  const dark = luminance(bg) < 0.4;
  const ink = dark ? "#f4f0e8" : "#15201c";
  const surface = mix(bg, dark ? "#ffffff" : "#15201c", dark ? 0.06 : 0.05);
  const accentMix = 0.04 + intensity * 0.4;
  const heroBg = `linear-gradient(120deg, ${mix(bg, accent, accentMix)}, ${mix(bg, dark ? "#000000" : "#ffffff", 0.35)})`;
  const accentSoft = withAlpha(accent, dark ? 0.28 : 0.16);
  return { bg, accent, surface, heroBg, accentSoft, ink };
}

function generatePalette() {
  const h = Math.floor(Math.random() * 360);
  const dark = Math.random() < 0.25;
  const bg = dark ? hslToHex(h, 22, 12) : hslToHex(h, 42, 95);
  const accent = hslToHex((h + (Math.random() < 0.5 ? 28 : 200)) % 360, 60, dark ? 60 : 42);
  return buildPalette(bg, accent);
}

function renderPaletteSwatches() {
  const wrap = $("#paletteSwatches");
  if (!wrap) return;
  wrap.innerHTML = PALETTE_PRESETS.map((preset) => {
    const active = state.palette && state.palette.preset === preset.key ? " active" : "";
    const label = escapeHtml(t(`palette.${preset.key}`));
    return `<button type="button" class="palette-swatch${active}" data-preset="${preset.key}" title="${label}" aria-label="${label}"><span style="background:${preset.bg}"></span><i style="background:${preset.accent}"></i></button>`;
  }).join("");
  $$("#paletteSwatches .palette-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = PALETTE_PRESETS.find((item) => item.key === button.dataset.preset);
      const palette = buildPalette(preset.bg, preset.accent);
      palette.preset = preset.key;
      applyPalette(palette);
    });
  });
}

function renderWorksInput() {
  const list = $("#worksList");
  if (!list) return;
  list.innerHTML = state.works
    .map(
      (work, index) => `
      <div class="work-input" data-work-row="${index}">
        <div class="work-input-row">
          <input type="text" data-wfield="title" data-wi="${index}" value="${escapeAttribute(work.title)}" placeholder="${escapeAttribute(t("works.title"))}">
          <input type="text" data-wfield="year" data-wi="${index}" value="${escapeAttribute(work.year)}" placeholder="${escapeAttribute(t("works.year"))}">
          <input type="text" data-wfield="medium" data-wi="${index}" value="${escapeAttribute(work.medium)}" placeholder="${escapeAttribute(t("works.medium"))}">
        </div>
        <textarea data-wfield="description" data-wi="${index}" rows="2" placeholder="${escapeAttribute(t("works.description"))}">${escapeHtml(work.description)}</textarea>
        <button type="button" class="link-btn" data-remove-work-input="${index}">${escapeHtml(t("works.remove"))}</button>
      </div>`
    )
    .join("");

  $$("#worksList [data-wfield]").forEach((field) => {
    field.addEventListener("input", () => {
      state.works[Number(field.dataset.wi)][field.dataset.wfield] = field.value;
      persist();
    });
  });
  $$("#worksList [data-remove-work-input]").forEach((button) => {
    button.addEventListener("click", () => {
      state.works.splice(Number(button.dataset.removeWorkInput), 1);
      renderWorksInput();
      persist();
    });
  });
}

function addWorkInput() {
  state.works.push({ title: "", year: "", medium: "", description: "" });
  renderWorksInput();
  persist();
  const last = $("#worksList .work-input:last-child input");
  if (last) last.focus();
}

function manualWorks() {
  return state.works
    .filter((work) => work.title || work.description || work.medium || work.year)
    .map((work) => ({
      title: clean(work.title) || "Œuvre",
      year: clean(work.year),
      medium: clean(work.medium),
      description: clean(work.description) || "Description à compléter."
    }));
}

function syncExtraLabel() {
  const label = $("#extraFieldLabel");
  if (!label) return;
  const prof = PROFESSIONS[state.profession] || PROFESSIONS.artiste;
  label.textContent = t(prof.extra.labelKey);
}

function updateProfession() {
  state.profession = $("#professionStyle").value;
  syncExtraLabel();
  persist();
  if (state.draft) {
    state.draft = buildLocalDraft();
    renderPreview();
    setStatus(t("status.professionApplied"));
  } else {
    setStatus(t("status.professionSaved"));
  }
}

function updatePerson() {
  state.person = $("#personStyle").value;
  persist();
  if (state.draft) {
    state.draft = buildLocalDraft();
    renderPreview();
    setStatus(t("status.personApplied"));
  } else {
    setStatus(t("status.personSaved"));
  }
}

function applyCustomPalette() {
  applyPalette(buildPalette($("#bgColor").value, $("#accentColor").value));
}

function onIntensityChange() {
  state.paletteIntensity = Number($("#bgIntensity").value) / 100;
  if (!state.palette) {
    persist();
    return;
  }
  const preset = state.palette.preset;
  const palette = buildPalette($("#bgColor").value, $("#accentColor").value, state.paletteIntensity);
  if (preset) palette.preset = preset;
  applyPalette(palette);
}

function applyPalette(palette) {
  state.palette = palette;
  if (palette) {
    $("#bgColor").value = palette.bg;
    $("#accentColor").value = palette.accent;
  }
  applyPreviewDesign();
  drawGeneratedCanvases();
  drawEmptyCanvas();
  renderPaletteSwatches();
  persist();
  setStatus(palette ? t("palette.applied") : t("palette.cleared"));
}

function portalPayload(includeImages) {
  return JSON.stringify({
    v: 1,
    draft: state.draft,
    pageStyle: state.pageStyle,
    motionStyle: state.motionStyle,
    layout: state.layout,
    palette: state.palette,
    paletteIntensity: state.paletteIntensity,
    person: state.person,
    profession: state.profession,
    fontTitle: state.fontTitle,
    fontBody: state.fontBody,
    images: includeImages ? state.images : []
  });
}

function bytesToB64Url(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(b64) {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(norm), (c) => c.charCodeAt(0));
}

async function encodePortal(str) {
  const input = new TextEncoder().encode(str);
  if (window.CompressionStream) {
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return "g" + bytesToB64Url(new Uint8Array(buf));
  }
  return "r" + bytesToB64Url(input);
}

async function decodePortal(param) {
  const flag = param[0];
  const bytes = b64UrlToBytes(param.slice(1));
  if (flag === "g" && window.DecompressionStream) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buf);
  }
  return new TextDecoder().decode(bytes);
}

async function copyInstantLink() {
  if (!state.draft) {
    setStatus(t("share.needPage"));
    return;
  }
  const base = `${location.origin}${location.pathname}`;
  let param = await encodePortal(portalPayload(true));
  let url = `${base}#p=${param}`;
  let droppedImages = false;
  if (url.length > 16000 && state.images.length) {
    param = await encodePortal(portalPayload(false));
    url = `${base}#p=${param}`;
    droppedImages = true;
  }
  await copyText(url, droppedImages ? t("share.copiedNoImg") : t("share.copied"));
}

async function enterViewMode(param) {
  try {
    const data = JSON.parse(await decodePortal(param));
    state.draft = data.draft;
    state.pageStyle = data.pageStyle || "minimal";
    state.motionStyle = data.motionStyle || "subtle";
    state.layout = data.layout || "editorial";
    state.palette = data.palette || null;
    state.paletteIntensity = typeof data.paletteIntensity === "number" ? data.paletteIntensity : 0.35;
    state.person = data.person || "third";
    state.profession = data.profession || "artiste";
    state.fontTitle = data.fontTitle || "default";
    state.fontBody = data.fontBody || "default";
    state.images = Array.isArray(data.images) ? data.images : [];
    if (!state.draft) throw new Error("draft manquant");

    document.body.classList.add("view-mode");
    captureFrench();
    renderPreview();
    preview.querySelectorAll(".edit-hint, .preview-only, .module-toolbar").forEach((node) => node.remove());
    preview.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));
    drawGeneratedCanvases();
    document.documentElement.lang = "fr";
    document.title = `${state.draft.name || "Portail"} — portail`;
  } catch (error) {
    // Lien invalide : on bascule sur l'application normale.
    location.hash = "";
    location.reload();
  }
}

function init() {
  if (location.hash.startsWith("#p=")) {
    enterViewMode(location.hash.slice(3));
    return;
  }
  loadState();
  bindEvents();
  initVoice();
  captureFrench();
  renderMessages();
  renderPreview();
  renderImages();
  renderStyleGallery();
  renderPaletteSwatches();
  renderWorksInput();
  $("#bgIntensity").value = Math.round(state.paletteIntensity * 100);
  if (state.palette) {
    $("#bgColor").value = state.palette.bg;
    $("#accentColor").value = state.palette.accent;
  }
  updateGenerateLabel();
  updateStepper();
  drawEmptyCanvas();
  applyLanguage(localStorage.getItem(LANG_KEY) || "fr");
  loadImages();
}

function bindEvents() {
  $("#sampleBtn").addEventListener("click", insertSample);
  $("#clearInputBtn").addEventListener("click", clearInput);
  $("#guidedBtn").addEventListener("click", toggleGuided);
  $("#speakToggle").addEventListener("change", (event) => {
    state.speak = event.target.checked;
    if (!state.speak && window.speechSynthesis) window.speechSynthesis.cancel();
  });
  $("#sendBtn").addEventListener("click", sendMessage);
  $("#composerSendBtn").addEventListener("click", sendMessage);
  $("#generateBtn").addEventListener("click", generatePortal);
  $("#exportHtmlBtn").addEventListener("click", () => exportHtml());
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#printBtn").addEventListener("click", () => {
    if (reviewConfirmed()) window.print();
  });
  $("#clearBtn").addEventListener("click", clearLocalData);
  $("#voiceBtn").addEventListener("click", toggleVoiceInput);
  $("#imageUpload").addEventListener("change", handleImages);
  $("#pageStyle").addEventListener("change", updateDesignChoice);
  $("#motionStyle").addEventListener("change", updateDesignChoice);
  $("#personStyle").addEventListener("change", updatePerson);
  $("#professionStyle").addEventListener("change", updateProfession);
  $("#extraField").addEventListener("input", (event) => {
    state.extra = event.target.value;
    persist();
  });
  $("#layoutStyle").addEventListener("change", updateLayout);
  $("#titleFont").addEventListener("change", updateFonts);
  $("#bodyFont").addEventListener("change", updateFonts);
  $("#addWorkInputBtn").addEventListener("click", addWorkInput);
  $("#addModuleBtn").addEventListener("click", addModuleFromToolbar);
  $("#boldTextBtn").addEventListener("click", toggleBoldText);
  $("#italicTextBtn").addEventListener("click", toggleItalicText);
  $("#fontWeightSelect").addEventListener("change", (event) => applyTextStyle("fontWeight", event.target.value));
  $("#fontSizeSelect").addEventListener("change", (event) => applyTextStyle("fontSize", event.target.value));
  $("#lineHeightSelect").addEventListener("change", (event) => applyTextStyle("lineHeight", event.target.value));
  $("#textAlignSelect").addEventListener("change", (event) => applyTextStyle("textAlign", event.target.value));
  $("#letterSpacingRange").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    applyTextStyle("letterSpacing", value ? `${value}px` : "");
  });
  $("#clearTextStyleBtn").addEventListener("click", clearActiveTextStyle);
  bindFloatingTextToolbar();

  $$(".audience-tag").forEach((checkbox) => checkbox.addEventListener("change", updateAudience));

  $("#langSwitch").addEventListener("change", (event) => applyLanguage(event.target.value));

  $("#bgColor").addEventListener("input", applyCustomPalette);
  $("#accentColor").addEventListener("input", applyCustomPalette);
  $("#bgIntensity").addEventListener("input", onIntensityChange);
  $("#generatePaletteBtn").addEventListener("click", () => applyPalette(generatePalette()));
  $("#resetPaletteBtn").addEventListener("click", () => applyPalette(null));

  messageInput.addEventListener("keydown", (event) => {
    // Style messagerie : Entrée envoie, Maj+Entrée insère un retour à la ligne.
    // event.isComposing protège la saisie IME (chinois, japonais…).
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener("input", updateStepper);

  $("#llmEndpoint").addEventListener("input", persist);
  $("#publishBtn").addEventListener("click", publishPage);
  if (!PUBLISH_ENDPOINT) $("#publishBtn").hidden = true;
  document.addEventListener("selectionchange", trackPreviewSelection);
  document.addEventListener("mousedown", maybeHideTextToolbar);
  document.addEventListener("dragover", updateModuleAutoScroll);
  document.addEventListener("drop", stopModuleAutoScroll);
  window.addEventListener("scroll", positionFloatingTextToolbar, { passive: true });
  window.addEventListener("resize", positionFloatingTextToolbar);
}

function initVoice() {
  const badge = $("#voiceBadge");
  if (SpeechRecognitionApi) {
    badge.textContent = "Dictée disponible";
    badge.classList.add("supported");
    return;
  }

  badge.textContent = "Dictée indisponible";
  badge.classList.add("unsupported");
  $("#voiceBtn").disabled = true;
}

function clearInput() {
  if (!messageInput.value.trim()) {
    setStatus(t("status.inputEmpty"));
    return;
  }
  messageInput.value = "";
  messageInput.focus();
  updateStepper();
  setStatus(t("status.inputCleared"));
}

function insertSample() {
  messageInput.value =
    "Je m'appelle Lina Moreau et je suis artiste visuelle à Marseille. Je travaille la peinture, la photographie et l'installation textile. Mes œuvres parlent de mémoire familiale, d'écologie urbaine et d'objets du quotidien. J'aimerais que ma page s'adresse aux commissaires d'exposition, aux galeries, aux résidences et aux institutions culturelles. Mes œuvres principales sont : Cartographie domestique, 2025, peinture sur toile, une série autour des gestes domestiques ; Archives de pluie, 2024, installation textile, un projet sur l'eau, la migration et les archives. J'ai participé à des expositions collectives à Marseille et à Lyon, et à une résidence locale en 2024. Mon objectif est de candidater à des expositions, résidences et commandes. Contact : contact@example.com.";
  messageInput.focus();
  setStatus("Un exemple est prêt. Vous pouvez le modifier librement, puis demander un guidage ou créer la page.");
}

function toggleGuided() {
  if (state.guided.active) {
    stopGuided();
  } else {
    startGuided();
  }
}

function startGuided() {
  state.guided = { active: true, step: 0 };
  $("#guidedBtn").textContent = t("guided.stop");
  state.messages.push({ role: "assistant", content: t("guided.intro") });
  postGuidedQuestion();
  setStatus(t("status.guidedStarted"));
  messageInput.focus();
}

function stopGuided() {
  state.guided.active = false;
  $("#guidedBtn").textContent = t("guided.start");
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  setStatus(t("status.guidedStopped"));
  persist();
}

function guidedQuestionText(step) {
  const q = GUIDED_QUESTIONS[step].q;
  if (q === "__extra__") {
    const prof = PROFESSIONS[state.profession] || PROFESSIONS.artiste;
    return t(prof.extra.question);
  }
  return t(q);
}

function postGuidedQuestion() {
  const question = guidedQuestionText(state.guided.step);
  state.messages.push({ role: "assistant", content: question });
  renderMessages();
  persist();
  speak(question);
}

function advanceGuided(answer) {
  const current = GUIDED_QUESTIONS[state.guided.step];
  if (current && answer) {
    state.guidedAnswers[current.key] = answer;
    if (current.key === "extra") state.extra = answer;
  }
  state.guided.step += 1;
  if (state.guided.step >= GUIDED_QUESTIONS.length) {
    state.messages.push({ role: "assistant", content: t("guided.done") });
    state.guided.active = false;
    $("#guidedBtn").textContent = t("guided.start");
    renderMessages();
    persist();
    speak(t("guided.done"));
    setStatus(t("guided.done"));
    return;
  }
  const ack = t(pick(GUIDED_ACK));
  const question = guidedQuestionText(state.guided.step);
  state.messages.push({ role: "assistant", content: `${ack} ${question}` });
  renderMessages();
  persist();
  speak(`${ack} ${question}`);
  messageInput.focus();
}

function speak(text) {
  if (!state.speak || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = $("#voiceLang").value || "fr-FR";
    window.speechSynthesis.speak(utterance);
  } catch {
    // synthèse vocale indisponible : on ignore.
  }
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) {
    setStatus("Commencez par quelques phrases. Par exemple : qui vous êtes, ce que vous créez, et à qui s'adresse votre page.");
    return;
  }

  state.messages.push({ role: "user", content: text });
  messageInput.value = "";
  renderMessages();
  persist();

  if (state.guided.active) {
    advanceGuided(text);
    return;
  }

  setStatus("Je relis vos informations et je vous propose la prochaine étape...");

  const sendBtn = $("#sendBtn");
  const composerSendBtn = $("#composerSendBtn");
  try {
    setBusy(sendBtn, true, "Analyse en cours…");
    setBusy(composerSendBtn, true, "Envoi…");
    const endpoint = $("#llmEndpoint").value.trim();
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "chat", messages: state.messages, prompt: buildChatPrompt() })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        state.messages.push({ role: "assistant", content: payload.reply || localAssistantReply() });
      } catch (error) {
        state.messages.push({ role: "assistant", content: `${localAssistantReply()}\n\nLe modèle connecté n'a pas répondu. J'utilise donc l'assistant local pour continuer. Détail : ${error.message}` });
      }
    } else {
      state.messages.push({ role: "assistant", content: localAssistantReply() });
    }

    renderMessages();
    persist();
    setStatus("Vous pouvez ajouter une précision, ou créer une première version de la page.");
  } finally {
    setBusy(sendBtn, false);
    setBusy(composerSendBtn, false);
  }
}

async function generatePortal() {
  const pendingText = messageInput.value.trim();
  if (pendingText) {
    state.messages.push({ role: "user", content: pendingText });
    messageInput.value = "";
  }

  if (!state.messages.some((message) => message.role === "user")) {
    insertSample();
    setStatus("J'ai placé un exemple pour vous aider à démarrer. Remplacez-le par vos propres mots avant de créer la page.");
    return;
  }

  setStatus("Je prépare une première version de votre page...");
  const generateBtn = $("#generateBtn");

  try {
    setBusy(generateBtn, true, "Création en cours…");
    const endpoint = $("#llmEndpoint").value.trim();

    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "generate", messages: state.messages, prompt: buildGenerationPrompt(), images: summarizeImages() })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        state.draft = normalizeDraft(payload);
        setStatus("La page est prête. Prenez le temps de vérifier les faits, les images et le ton avant toute publication.");
      } catch (error) {
        state.draft = buildLocalDraft();
        setStatus(`Le modèle connecté n'a pas répondu. J'ai créé une version locale que vous pouvez déjà modifier. Détail : ${error.message}`);
      }
    } else {
      state.draft = buildLocalDraft();
      setStatus("Une première page est générée. Vous pouvez cliquer sur les textes dans l'aperçu pour les ajuster.");
    }

    renderMessages();
    renderPreview();
    persist();
  } finally {
    setBusy(generateBtn, false);
    updateGenerateLabel();
  }
}

function localAssistantReply() {
  const profile = extractProfile();
  const missing = [];
  if (!profile.name) missing.push("votre nom d'artiste");
  if (!profile.practice) missing.push("vos médiums ou votre pratique");
  if (!profile.themes) missing.push("les thèmes de votre travail");
  if (!profile.audience) missing.push("les personnes à qui la page s'adresse");
  if (!profile.works.length) missing.push("une ou deux œuvres importantes");

  if (!missing.length) {
    return "Merci, les informations sont déjà suffisantes pour créer une première page. Je vais les organiser en titre, présentation, œuvres, objectifs, contact et points à vérifier avant publication. Vous pouvez cliquer sur « Créer ma page ».";
  }

  return `Merci, c'est un bon début. Pour obtenir une page plus personnelle, vous pouvez encore ajouter : ${missing.join(", ")}. Si vous préférez avancer tout de suite, créez une première version et vous pourrez la corriger ensuite.`;
}

function extractProfile() {
  const userMessages = state.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content);

  // Conversation chronologique (pour les listes : œuvres, liens).
  const chronological = userMessages.join("\n");
  // Pour les champs uniques (nom, lieu, contact…), le message le plus récent
  // doit primer : on parcourt donc du plus récent au plus ancien.
  const text = [...userMessages].reverse().join("\n");

  const name =
    matchFirst(text, /je m'appelle\s+([^,.\n]+)/i) ||
    matchFirst(text, /mon nom(?: d'artiste)? est\s+([^,.\n]+)/i) ||
    matchFirst(text, /je suis\s+([^,.\n]+?)(?:,|\.|\n)/i) ||
    matchFirst(text, /我叫\s*([^，。,.\n]+)/) ||
    matchFirst(text, /我是\s*([^，。,.\n]+?)(?:，|,|。|\n)/) ||
    matchFirst(text, /名字(?:是|:|：)\s*([^，。,.\n]+)/) ||
    matchFirst(text, /name(?: is|:)\s*([^,.\n]+)/i) ||
    "Artiste";

  const location =
    matchFirst(text, /(?:bas[ée]{0,2}|install[ée]{0,2}|réside|vit|je vis)\s+(?:à|a)\s+([A-ZÀ-Ý][a-zà-ÿ'’]+(?:-[A-ZÀ-Ý]?[a-zà-ÿ'’]+)*)/) ||
    matchFirst(text, /(?:^|\s)(?:à|a)\s+([A-ZÀ-Ý][a-zà-ÿ'’]+(?:-[A-ZÀ-Ý]?[a-zà-ÿ'’]+)*)/) ||
    matchFirst(text, /在\s*([^，。,.\n]{2,18}?)(?:工作|生活|创作)/) ||
    matchFirst(text, /来自\s*([^，。,.\n]+)/) ||
    matchFirst(text, /base[sd]?\s+in\s+([^,.\n]+)/i) ||
    "";

  const profDefaults = (PROFESSIONS[state.profession] || PROFESSIONS.artiste).defaults;

  const practice =
    matchFirst(text, /je travaille\s+(?:avec\s+)?([^.\n]+?)(?:\.|\n)/i) ||
    matchFirst(text, /ma pratique(?: porte sur| est| mêle| combine|:)?\s*([^.\n]+)/i) ||
    matchFirst(text, /m[ée]diums?(?: principaux)?(?: sont|:)?\s*([^.\n]+)/i) ||
    matchFirst(text, /做\s*([^，。.\n]+?)(?:，|。|\n)/) ||
    matchFirst(text, /媒介(?:是|包括|:|：)\s*([^。.\n]+)/) ||
    findKeywords(text, ["peinture", "photographie", "installation", "vidéo", "sculpture", "textile", "édition", "performance", "dessin", "art numérique"]).join(", ") ||
    findKeywords(text, ["绘画", "摄影", "装置", "影像", "雕塑", "纺织", "版画", "行为", "插画", "数字艺术"]).join(", ") ||
    profDefaults.practice;

  const themes =
    matchFirst(text, /(?:mes œuvres|mon travail|ma recherche)\s+(?:parlent de|porte sur|interroge|explore)\s+([^.\n]+)/i) ||
    matchFirst(text, /(?:thèmes?|sujets?)(?: sont|:)?\s*([^.\n]+)/i) ||
    matchFirst(text, /关于\s*([^。.\n]+)/) ||
    matchFirst(text, /主题(?:是|包括|:|：)\s*([^。.\n]+)/) ||
    profDefaults.themes;

  const audience =
    matchFirst(text, /(?:s'adresse|s'adresserait)\s+(?:à|aux|au)\s+([^.\n]+)/i) ||
    matchFirst(text, /(?:pour|à destination de)\s+([^.\n]+?)(?:\.|\n)/i) ||
    matchFirst(text, /给\s*([^。.\n]+?)看/) ||
    matchFirst(text, /面向\s*([^。.\n]+)/) ||
    profDefaults.audience;

  const goals =
    matchFirst(text, /(?:mon objectif|mes objectifs|j'aimerais|je souhaite)\s+(?:est de|sont de|de)?\s*([^.\n]+)/i) ||
    matchFirst(text, /目标(?:是|包括|:|：)\s*([^。.\n]+)/) ||
    matchFirst(text, /希望\s*([^。.\n]+)/) ||
    "présenter le travail, candidater à des opportunités et faciliter les prises de contact";

  const contact =
    matchFirst(text, /([\w.+-]+@[\w.-]+\.[a-z]{2,})/i) ||
    matchFirst(text, /(https?:\/\/[^\s，。]+)/i) ||
    "contact@example.com";

  // Les réponses de la conversation guidée sont rattachées à leur champ et priment
  // sur l'extraction par expressions régulières (réponses souvent trop courtes pour le regex).
  const guided = state.guidedAnswers || {};
  const guidedContact = guided.contact
    ? matchFirst(guided.contact, /([\w.+-]+@[\w.-]+\.[a-z]{2,})/i) || clean(guided.contact)
    : "";
  const guidedWorks = guided.works
    ? extractWorks(guided.works).length
      ? extractWorks(guided.works)
      : [{ title: clean(guided.works), year: "", medium: "", description: "Description à compléter." }]
    : null;

  return {
    raw: chronological,
    name: cleanName(guided.name || name),
    location: clean(guided.location || location),
    practice: clean(guided.practice || practice),
    themes: clean(guided.themes || themes),
    audience: clean(guided.audience || audience),
    goals: clean(guided.goals || goals),
    contact: guidedContact || clean(contact),
    links: extractLinks(chronological),
    works: guidedWorks || extractWorks(chronological)
  };
}

const PROFESSIONS = {
  artiste: {
    roleDefault: "Artiste",
    roles: [
      [/com[ée]dien/i, "Comédien·ne"], [/danseu|danse\b/i, "Danseur·se"], [/chor[ée]graph/i, "Chorégraphe"],
      [/musicien|chant|compositeur/i, "Musicien·ne"], [/circ|acrobat|jongl|trap[èe]z/i, "Artiste de cirque"],
      [/marionnett/i, "Marionnettiste"], [/metteur|mise en sc[èe]ne/i, "Metteur·se en scène"],
      [/auteur|[ée]criv|dramaturg/i, "Auteur·rice"], [/peint/i, "Peintre"], [/photograph/i, "Photographe"],
      [/sculpt/i, "Sculpteur·rice"], [/install/i, "Artiste plasticien·ne"], [/vid[ée]o/i, "Artiste vidéaste"],
      [/textile/i, "Artiste textile"], [/dessin/i, "Dessinateur·rice"], [/performance/i, "Artiste performeur·se"]
    ],
    sections: { statement: "Présentation", works: "Œuvres & créations", bio: "Repères professionnels" },
    defaults: { practice: "arts visuels et vivants", themes: "la création et les imaginaires contemporains", audience: "le public, les programmateurs et les partenaires culturels" },
    extra: { labelKey: "extra.artiste.label", question: "extra.artiste.q", heading: "Formation & distinctions" },
    worksLabel: "Vos œuvres / créations (optionnel)",
    seoTail: "Portail présentant œuvres, démarche, parcours et contact.",
    worksDefault: (p) => ({ title: "Création représentative", year: "", medium: p.practice, description: `Un projet à préciser autour de ${lowerFirst(p.themes)}.` }),
    statements: (v, first) =>
      first
        ? [
            `${v.location ? `Basé·e à ${v.location}, je crée` : "Je crée"} autour de ${v.themes}, à travers ${v.practice}. Chaque proposition cherche à ouvrir un espace sensible plutôt qu'à illustrer un propos.`,
            `Mon travail prend forme dans ${v.practice}. ${v.firstTheme} et les motifs qui l'entourent y reviennent comme des fils conducteurs.`
          ]
        : [
            `${v.where} crée autour de ${v.themes}, à travers ${v.practice}. Chaque proposition cherche à ouvrir un espace sensible plutôt qu'à illustrer un propos.`,
            `Le travail de ${v.where} prend forme dans ${v.practice}. ${v.firstTheme} et les motifs qui l'entourent y reviennent comme des fils conducteurs.`
          ],
    bios: (v, first) =>
      first
        ? [
            `Au fil des créations et des collaborations, j'affine un langage personnel. Cette page réunit mes pièces marquantes et les repères utiles pour ${v.audience}.`,
            `Mon parcours se lit comme une recherche continue. Ce portail en donne un aperçu clair — œuvres, démarche et contact — pensé pour ${v.audience}.`
          ]
        : [
            `Au fil des créations et des collaborations, ${v.name} affine un langage personnel. Cette page réunit les pièces marquantes et les repères utiles pour ${v.audience}.`,
            `Le parcours de ${v.name} se lit comme une recherche continue. Ce portail en donne un aperçu clair — œuvres, démarche et contact — pensé pour ${v.audience}.`
          ]
  },
  technicien: {
    roleDefault: "Technicien·ne du spectacle",
    roles: [
      [/son|sound|sonoris/i, "Ingénieur·e / régisseur·se son"], [/lumi[èe]re|[ée]clair/i, "Régisseur·se lumière"],
      [/plateau|machin/i, "Machiniste / régisseur·se plateau"], [/g[ée]n[ée]ral/i, "Régisseur·se général·e"],
      [/r[ée]gie|r[ée]giss/i, "Régisseur·se"], [/vid[ée]o/i, "Technicien·ne vidéo"],
      [/d[ée]cor|construct/i, "Constructeur·rice de décors"], [/costume|habill/i, "Habilleur·se / costumier·ère"],
      [/plateau/i, "Technicien·ne plateau"]
    ],
    sections: { statement: "Profil", works: "Productions & réalisations", bio: "Compétences & parcours" },
    defaults: { practice: "la technique du spectacle", themes: "la scène, le plateau et l'événementiel", audience: "les compagnies, les lieux et les festivals" },
    extra: { labelKey: "extra.technicien.label", question: "extra.technicien.q", heading: "Habilitations & compétences techniques" },
    worksLabel: "Vos productions (tournées, spectacles…) (optionnel)",
    seoTail: "Portail présentant productions, compétences, parcours et contact.",
    worksDefault: (p) => ({ title: "Production récente", year: "", medium: p.practice, description: "Production à préciser : rôle, lieu, dates." }),
    statements: (v, first) =>
      first
        ? [
            `${v.location ? `Basé·e à ${v.location}, je mets` : "Je mets"} mon savoir-faire technique au service des productions, autour de ${v.practice}. Rigueur, sécurité et sens du collectif guident mon travail.`,
            `J'interviens sur ${v.practice}, en lien étroit avec les équipes artistiques et techniques. ${v.firstTheme} fait partie de mes contextes d'intervention.`
          ]
        : [
            `${v.where} met son savoir-faire technique au service des productions, autour de ${v.practice}. Rigueur, sécurité et sens du collectif guident son travail.`,
            `${v.where} intervient sur ${v.practice}, en lien étroit avec les équipes artistiques et techniques. ${v.firstTheme} fait partie de ses contextes d'intervention.`
          ],
    bios: (v, first) =>
      first
        ? [
            `Tournées, créations et événements : j'accompagne les projets de la préparation au plateau. Cette page réunit mes expériences et compétences pour ${v.audience}.`,
            `Mon parcours allie technique et terrain. Ce portail présente mes réalisations, mes compétences et mes contacts, à destination de ${v.audience}.`
          ]
        : [
            `Tournées, créations et événements : ${v.name} accompagne les projets de la préparation au plateau. Cette page réunit ses expériences et compétences pour ${v.audience}.`,
            `Le parcours de ${v.name} allie technique et terrain. Ce portail présente ses réalisations, ses compétences et ses contacts, à destination de ${v.audience}.`
          ]
  },
  gestion: {
    roleDefault: "Administration & production",
    roles: [
      [/production/i, "Chargé·e de production"], [/diffus/i, "Chargé·e de diffusion"],
      [/administ/i, "Administrateur·rice"], [/communic/i, "Chargé·e de communication"],
      [/m[ée]diation/i, "Chargé·e de médiation"], [/billet/i, "Responsable billetterie"],
      [/direct/i, "Directeur·rice"], [/coordin/i, "Coordinateur·rice"]
    ],
    sections: { statement: "Profil", works: "Productions & projets", bio: "Compétences & parcours" },
    defaults: { practice: "la production du spectacle vivant", themes: "la production et la diffusion de spectacles", audience: "les compagnies, les institutions et les partenaires" },
    extra: { labelKey: "extra.gestion.label", question: "extra.gestion.q", heading: "Structures & budgets" },
    worksLabel: "Vos productions & projets (optionnel)",
    seoTail: "Portail présentant productions, compétences, parcours et contact.",
    worksDefault: (p) => ({ title: "Production récente", year: "", medium: "", description: "Projet à préciser : structure, missions, partenaires." }),
    statements: (v, first) =>
      first
        ? [
            `${v.location ? `Basé·e à ${v.location}, j'accompagne` : "J'accompagne"} des projets du spectacle vivant sur ${v.practice}. J'aime structurer, sécuriser et faire avancer les productions avec les équipes.`,
            `Je travaille sur ${v.practice}, à l'interface des artistes, des institutions et des partenaires. ${v.firstTheme} fait partie de mes domaines d'intervention.`
          ]
        : [
            `${v.where} accompagne des projets du spectacle vivant sur ${v.practice}, en structurant et en sécurisant les productions avec les équipes.`,
            `${v.where} travaille sur ${v.practice}, à l'interface des artistes, des institutions et des partenaires. ${v.firstTheme} fait partie de ses domaines d'intervention.`
          ],
    bios: (v, first) =>
      first
        ? [
            `De la production à la diffusion, j'accompagne les projets dans la durée. Cette page réunit mes expériences, mes compétences et mes contacts pour ${v.audience}.`,
            `Mon parcours conjugue gestion, relationnel et stratégie. Ce portail en donne un aperçu clair, à destination de ${v.audience}.`
          ]
        : [
            `De la production à la diffusion, ${v.name} accompagne les projets dans la durée. Cette page réunit ses expériences, ses compétences et ses contacts pour ${v.audience}.`,
            `Le parcours de ${v.name} conjugue gestion, relationnel et stratégie. Ce portail en donne un aperçu clair, à destination de ${v.audience}.`
          ]
  }
};

function roleFor(professionId, practice) {
  const prof = PROFESSIONS[professionId] || PROFESSIONS.artiste;
  const text = clean(practice);
  for (const [pattern, label] of prof.roles) {
    if (pattern.test(text)) return label;
  }
  if (professionId === "artiste") {
    const media = ["peint", "photograph", "installation", "sculpt", "textile", "dessin", "vid"];
    if (media.filter((m) => text.toLowerCase().includes(m)).length >= 3) return "Artiste pluridisciplinaire";
  }
  return prof.roleDefault;
}

function buildLocalDraft() {
  const profile = extractProfile();
  const name = profile.name || "Artiste";
  const prof = PROFESSIONS[state.profession] || PROFESSIONS.artiste;
  const keywords = extractKeywords(`${profile.practice} ${profile.themes} ${profile.audience} ${profile.goals}`);
  const entered = manualWorks();
  const works = entered.length ? entered : profile.works.length ? profile.works : [prof.worksDefault(profile)];

  const role = roleFor(state.profession, profile.practice);
  const practice = lowerFirst(profile.practice);
  const themes = lowerFirst(profile.themes);
  const firstTheme = capFirst(splitList(profile.themes)[0] || profile.themes);
  const audienceSource = state.audience.length ? joinList(state.audience) : profile.audience;
  const audience = lowerFirst(cleanAudience(audienceSource));
  const where = profile.location ? `${name}, basé·e à ${profile.location},` : name;
  const first = state.person === "first";
  const vars = { name, where, practice, themes, firstTheme, audience, location: profile.location };

  const tagline = pick([`${role} · ${firstTheme}`, `${role} — autour de ${themes}`, role]);
  const statement = pick(prof.statements(vars, first));
  const bio = pick(prof.bios(vars, first));
  const extra = capFirst(clean(state.extra || (state.guidedAnswers && state.guidedAnswers.extra) || ""));

  return {
    name,
    location: profile.location,
    tagline,
    statement,
    bio,
    extra,
    extraHeading: prof.extra.heading,
    sections: prof.sections,
    goals: capFirst(profile.goals),
    contact: profile.contact,
    seo: `${name}, ${lowerFirst(role)} — ${practice}. ${prof.seoTail}`,
    keywords,
    works,
    links: profile.links,
    complianceNote: "Brouillon assisté par IA. Avant publication, l'artiste doit vérifier les faits, les droits d'image et le ton du texte.",
    updatedAt: new Date().toISOString()
  };
}

function pick(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function capFirst(value) {
  const v = clean(value);
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

function lowerFirst(value) {
  const v = clean(value);
  return v ? v.charAt(0).toLowerCase() + v.slice(1) : v;
}

function splitList(value) {
  return clean(value)
    .split(/\s*,\s*|\s*;\s*|\s+et\s+|\s*&\s*/i)
    .map((part) => clean(part).replace(/^(?:de\s+la|de\s+l'|du|des|de|d'|la|le|les|l')\s*/i, ""))
    .filter(Boolean);
}

function joinList(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}`;
}

function joinTwo(list) {
  const parts = list.slice(0, 2);
  if (parts.length < 2) return parts[0] || "plusieurs médiums";
  return `${parts[0]} et ${parts[1]}`;
}

function cleanAudience(value) {
  return clean(value)
    .replace(/\b(?:aux|au)\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function guessRole(practice) {
  const p = clean(practice).toLowerCase();
  const media = ["peint", "photograph", "installation", "vidéo", "video", "sculpt", "textile", "dessin", "performance", "gravure", "céramique", "numérique"];
  const found = media.filter((m) => p.includes(m));
  if (found.length >= 3) return "Artiste visuel·le pluridisciplinaire";
  const map = {
    peint: "Peintre",
    photograph: "Photographe",
    installation: "Artiste plasticien·ne",
    vidéo: "Artiste vidéaste",
    video: "Artiste vidéaste",
    sculpt: "Sculpteur·rice",
    textile: "Artiste textile",
    dessin: "Dessinateur·rice",
    performance: "Artiste performeur·se",
    gravure: "Graveur·se",
    céramique: "Céramiste",
    numérique: "Artiste numérique"
  };
  return map[found[0]] || "Artiste visuel·le";
}

function cleanName(value) {
  let v = clean(value);
  // Retire les amorces fréquentes (« Je m'appelle… », « My name is… », « 我叫… »).
  v = v.replace(/^\s*(?:je m'appelle|mon nom(?: d'artiste)? est|je suis|moi,?\s*c'est|my name is|i\s*am|i'm|name\s*[:：]?\s*|我的名字(?:是|叫)|名字(?:是|叫)|我叫|我是)\s*/i, "");
  // Coupe quand la phrase continue au-delà du nom (« Lina Moreau et je suis… »).
  v = v.split(/\s+(?:et|qui|je|qui suis|basé|basée|installé|installée|qui travaille)\b/i)[0];
  v = v.replace(/\b(?:est|suis)\b.*$/i, "");
  v = v.split(/\s+/).slice(0, 4).join(" ");
  return clean(v) || "Artiste";
}

function normalizeDraft(payload) {
  const local = buildLocalDraft();
  return {
    ...local,
    ...payload,
    works: Array.isArray(payload.works) ? payload.works : local.works,
    keywords: Array.isArray(payload.keywords) ? payload.keywords : local.keywords,
    links: Array.isArray(payload.links) ? payload.links : local.links
  };
}

function renderMessages() {
  if (!state.messages.length) {
    chatLog.innerHTML = `<div class="message assistant">${escapeHtml(t("chat.greeting"))}</div>`;
    updateStepper();
    return;
  }

  chatLog.innerHTML = state.messages
    .map((message, index) => {
      const isUser = message.role === "user";
      const editButton = isUser
        ? `<button type="button" class="msg-btn" data-edit-msg="${index}">${escapeHtml(t("msg.edit"))}</button>`
        : "";
      return `
        <div class="message ${message.role}" data-msg-index="${index}">
          <div class="message-text">${escapeHtml(message.content)}</div>
          <div class="message-tools">
            ${editButton}
            <button type="button" class="msg-btn" data-del-msg="${index}">${escapeHtml(t("msg.delete"))}</button>
          </div>
        </div>`;
    })
    .join("");
  bindMessageControls();
  updateStepper();
  chatLog.scrollTop = chatLog.scrollHeight;
}

function bindMessageControls() {
  $$("[data-del-msg]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm(t("msg.deleteConfirm"))) return;
      state.messages.splice(Number(button.dataset.delMsg), 1);
      renderMessages();
      persist();
      setStatus(t("msg.deleted"));
    });
  });
  $$("[data-edit-msg]").forEach((button) => {
    button.addEventListener("click", () => startEditMessage(Number(button.dataset.editMsg)));
  });
}

function startEditMessage(index) {
  const bubble = chatLog.querySelector(`[data-msg-index="${index}"]`);
  if (!bubble) return;
  bubble.innerHTML = `
    <textarea class="msg-edit-area" rows="4">${escapeHtml(state.messages[index].content)}</textarea>
    <div class="message-tools">
      <button type="button" class="msg-btn" data-save-msg="${index}">${escapeHtml(t("msg.save"))}</button>
      <button type="button" class="msg-btn" data-cancel-msg="${index}">${escapeHtml(t("msg.cancel"))}</button>
    </div>`;
  const area = bubble.querySelector("textarea");
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
  bubble.querySelector("[data-save-msg]").addEventListener("click", () => {
    const value = area.value.trim();
    if (!value) {
      setStatus(t("msg.emptyEdit"));
      return;
    }
    state.messages[index].content = value;
    renderMessages();
    persist();
    setStatus(t("msg.updated"));
  });
  bubble.querySelector("[data-cancel-msg]").addEventListener("click", () => renderMessages());
}

function makeModuleId() {
  return `module-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeStyle(style) {
  return style && typeof style === "object" && !Array.isArray(style) ? style : {};
}

function ensureDraftModules(draft) {
  if (!draft) return [];
  draft.fieldStyles = normalizeStyle(draft.fieldStyles);
  if (!draft.sections) {
    draft.sections = { statement: "Présentation", works: "Œuvres sélectionnées", bio: "Repères professionnels" };
  }

  if (!Array.isArray(draft.modules)) {
    draft.modules = [
      { id: makeModuleId(), type: "text", legacy: "statement", zone: "main", title: draft.sections.statement || "Présentation", body: draft.statement || "" },
      { id: makeModuleId(), type: "works", legacy: "works", zone: "main", title: draft.sections.works || "Œuvres sélectionnées" },
      { id: makeModuleId(), type: "text", legacy: "bio", zone: "side", title: draft.sections.bio || "Repères professionnels", body: draft.bio || "" },
      ...(draft.extra ? [{ id: makeModuleId(), type: "text", legacy: "extra", zone: "side", title: draft.extraHeading || "Informations complémentaires", body: draft.extra }] : []),
      { id: makeModuleId(), type: "text", legacy: "goals", zone: "side", title: "Objectifs", body: draft.goals || "" },
      { id: makeModuleId(), type: "contact", legacy: "contact", zone: "side", title: "Contact", body: draft.contact || "", links: draft.links || [] },
      { id: makeModuleId(), type: "seo", legacy: "seo", zone: "side", title: "SEO", body: draft.seo || "", keywords: draft.keywords || [] }
    ];
  }

  // Le rappel « À vérifier avant publication » n'est pas une section publique :
  // il reste sous forme de cases à cocher sous l'aperçu. On le retire de la page.
  draft.modules = draft.modules.filter((module) => module.legacy !== "complianceNote");

  draft.modules.forEach((module) => {
    module.id = module.id || makeModuleId();
    module.type = module.type || "text";
    module.zone = module.zone === "side" ? "side" : "main";
    module.title = module.title || defaultModuleTitle(module.type);
    module.body = module.body || "";
    module.styles = normalizeStyle(module.styles);
    module.styles.title = normalizeStyle(module.styles.title);
    module.styles.body = normalizeStyle(module.styles.body);
    if (module.type === "contact") module.links = Array.isArray(module.links) ? module.links : draft.links || [];
    if (module.type === "links") module.links = Array.isArray(module.links) ? module.links : draft.links || [];
    if (module.type === "seo") module.keywords = Array.isArray(module.keywords) ? module.keywords : draft.keywords || [];
  });

  return draft.modules;
}

function defaultModuleTitle(type) {
  return {
    text: "Nouveau texte",
    works: "Œuvres",
    contact: "Contact",
    links: "Liens utiles",
    seo: "Résumé",
    note: "Note"
  }[type] || "Module";
}

function createEmptyModule(type) {
  const common = { id: makeModuleId(), type, zone: "main", title: defaultModuleTitle(type), body: "", styles: { title: {}, body: {} } };
  if (type === "works") return { ...common, title: "Œuvres", body: "" };
  if (type === "contact") return { ...common, zone: "side", body: "contact@example.com", links: [] };
  if (type === "links") return { ...common, zone: "side", body: "Ajoutez ici les liens importants.", links: [] };
  if (type === "note") return { ...common, zone: "side", body: "Information à compléter." };
  return { ...common, body: "Texte à compléter." };
}

function addModuleFromToolbar() {
  if (!state.draft) {
    setStatus("Créez d'abord une page, puis vous pourrez ajouter des modules.");
    return;
  }
  const type = $("#moduleType").value || "text";
  ensureDraftModules(state.draft).push(createEmptyModule(type));
  renderPreview();
  persist();
  setStatus("Module ajouté. Vous pouvez modifier son titre et son contenu directement dans l'aperçu.");
  const lastTitle = preview.querySelector(".editable-module:last-of-type [contenteditable]");
  if (lastTitle) lastTitle.focus();
}

function styleToString(style) {
  const s = normalizeStyle(style);
  const allowed = ["fontWeight", "fontStyle", "fontSize", "lineHeight", "textAlign", "letterSpacing"];
  return allowed
    .filter((key) => s[key])
    .map((key) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${String(s[key]).replace(/[;"<>]/g, "")}`)
    .join(";");
}

function styleAttr(style) {
  const value = styleToString(style);
  return value ? ` style="${escapeAttribute(value)}"` : "";
}

function moduleById(id) {
  return ensureDraftModules(state.draft).find((module) => module.id === id);
}

function syncModuleToDraft(module, field) {
  if (!state.draft || !module) return;
  if (field === "title") {
    if (module.legacy === "statement") state.draft.sections.statement = module.title;
    if (module.legacy === "works") state.draft.sections.works = module.title;
    if (module.legacy === "bio") state.draft.sections.bio = module.title;
    return;
  }
  if (field !== "body") return;
  if (module.legacy && module.legacy !== "works") {
    state.draft[module.legacy] = module.body;
  }
  if (module.type === "contact") state.draft.contact = module.body;
  if (module.type === "seo") state.draft.seo = module.body;
}

function renderModuleToolbar(module) {
  return `
    <div class="module-toolbar preview-only" draggable="true" data-module-drag="${module.id}" aria-label="Contrôles du module">
      <span>Module</span>
      <button type="button" class="module-btn" data-module-up="${module.id}" title="Monter" aria-label="Monter">↑</button>
      <button type="button" class="module-btn" data-module-down="${module.id}" title="Descendre" aria-label="Descendre">↓</button>
      <button type="button" class="module-btn" data-module-zone="${module.id}" title="Changer de colonne" aria-label="Changer de colonne">↔</button>
      <button type="button" class="module-btn danger" data-module-delete="${module.id}" title="Supprimer" aria-label="Supprimer">×</button>
    </div>
  `;
}

function renderModule(module) {
  const title = `<h3 contenteditable="true" data-edit-module="${module.id}.title" data-style-key="module:${module.id}:title"${styleAttr(module.styles?.title)}>${escapeHtml(module.title)}</h3>`;
  const body = `<p class="module-body" contenteditable="true" data-edit-module="${module.id}.body" data-style-key="module:${module.id}:body" data-placeholder="Texte à compléter"${styleAttr(module.styles?.body)}>${escapeHtml(module.body)}</p>`;
  const tagName = module.zone === "side" ? "div" : "section";
  const baseClass = module.zone === "side" ? "side-box" : "portal-section";
  let content = "";

  if (module.type === "works") {
    content = `${title}<div class="work-grid">${renderWorks(state.draft.works || [])}</div><button id="addWorkBtn" type="button" class="button secondary preview-only add-work">+ Ajouter une œuvre</button>`;
  } else if (module.type === "contact") {
    content = `${title}${body}${renderLinks(module.links || state.draft.links || [])}`;
  } else if (module.type === "links") {
    content = `${title}${body}${renderLinks(module.links || state.draft.links || [])}`;
  } else if (module.type === "seo") {
    const keywords = Array.isArray(module.keywords) ? module.keywords : state.draft.keywords || [];
    content = `<details class="seo-fold"><summary>${escapeHtml(module.title)} <span class="seo-hint">${escapeHtml(t("seo.hint"))}</span></summary>${body}<ul class="tag-list">${keywords.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul></details>`;
  } else {
    content = `${title}${body}`;
  }

  return `
    <${tagName} class="${baseClass} editable-module module-${module.type}" data-module-id="${module.id}" data-legacy="${module.legacy || ""}">
      ${renderModuleToolbar(module)}
      ${content}
    </${tagName}>
  `;
}

function renderModuleColumn(zone) {
  const modules = ensureDraftModules(state.draft).filter((module) => module.zone === zone);
  if (!modules.length) {
    return `<div class="module-drop-empty preview-only" data-empty-zone="${zone}">Déposez un module ici</div>`;
  }
  return modules.map(renderModule).join("");
}

function renderPreview() {
  applyPreviewDesign();
  updateStepper();

  if (!state.draft) {
    $("#pageEditorToolbar").hidden = true;
    $("#shareKitPanel").hidden = true;
    activeEditable = null;
    hideFloatingTextToolbar();
    const template = $("#emptyPreviewTemplate");
    preview.innerHTML = "";
    preview.append(template.content.cloneNode(true));
    translateTree(preview);
    drawEmptyCanvas();
    return;
  }

  const draft = state.draft;
  ensureDraftModules(draft);
  $("#pageEditorToolbar").hidden = false;
  $("#shareKitPanel").hidden = false;
  preview.innerHTML = `
    <p class="edit-hint" role="note">Astuce : cliquez sur un texte pour le modifier ou le styliser. Déplacez les modules avec les flèches ou par glisser-déposer.</p>
    <header class="portal-hero">
      <div>
        <span class="generated-note">Brouillon assisté par IA · modifiable</span>
        <h2 contenteditable="true" data-edit="name" data-style-key="field:name"${styleAttr(draft.fieldStyles?.name)}>${escapeHtml(draft.name)}</h2>
        <p contenteditable="true" data-edit="tagline" data-style-key="field:tagline"${styleAttr(draft.fieldStyles?.tagline)}>${escapeHtml(draft.tagline)}</p>
        ${draft.location ? `<p contenteditable="true" data-edit="location" data-style-key="field:location"${styleAttr(draft.fieldStyles?.location)}><strong>${escapeHtml(draft.location)}</strong></p>` : ""}
      </div>
      <div class="portal-visual-wrap">
        <div class="portal-visual">${renderHeroVisual()}</div>
        ${heroImageControl()}
      </div>
    </header>
    <div class="portal-body">
      <div class="portal-column portal-main" data-module-zone="main">
        ${renderModuleColumn("main")}
      </div>
      <aside class="portal-column portal-side" data-module-zone="side">
        ${renderModuleColumn("side")}
      </aside>
    </div>
  `;

  bindEditableFields();
  bindModuleControls();
  bindWorkEditing();
  drawGeneratedCanvases();
  updateTypographyControls();
  renderShareKit();
}

function bindEditableFields() {
  $$("[contenteditable]").forEach((node) => {
    node.setAttribute("title", "Cliquez pour modifier");
    if (!node.hasAttribute("aria-label")) node.setAttribute("aria-label", "Champ modifiable");
    node.addEventListener("focus", () => setActiveEditable(node, { showFloating: false }));
    node.addEventListener("click", () => setActiveEditable(node, { showFloating: false }));
  });

  $$("[contenteditable][data-edit]").forEach((node) => {
    node.addEventListener("input", () => {
      state.draft[node.dataset.edit] = node.textContent.trim();
      persist();
      renderShareKit({ keepUrlInput: true });
    });
  });

  $$("[contenteditable][data-edit-module]").forEach((node) => {
    node.addEventListener("input", () => {
      const [id, field] = node.dataset.editModule.split(".");
      const module = moduleById(id);
      if (!module) return;
      module[field] = node.textContent.trim();
      syncModuleToDraft(module, field);
      persist();
      renderShareKit({ keepUrlInput: true });
    });
  });
}

function bindModuleControls() {
  $$("[data-module-up]").forEach((button) => {
    button.addEventListener("click", () => moveModule(button.dataset.moduleUp, -1));
  });
  $$("[data-module-down]").forEach((button) => {
    button.addEventListener("click", () => moveModule(button.dataset.moduleDown, 1));
  });
  $$("[data-module-zone]").forEach((button) => {
    button.addEventListener("click", () => toggleModuleZone(button.dataset.moduleZone));
  });
  $$("[data-module-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteModule(button.dataset.moduleDelete));
  });
  $$("[data-module-drag]").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      draggedModuleId = handle.dataset.moduleDrag;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedModuleId);
    });
    handle.addEventListener("dragend", () => {
      draggedModuleId = null;
      stopModuleAutoScroll();
      $$(".editable-module.drag-over").forEach((node) => node.classList.remove("drag-over"));
    });
  });
  $$(".editable-module").forEach((moduleNode) => {
    moduleNode.addEventListener("dragover", (event) => {
      if (!draggedModuleId || draggedModuleId === moduleNode.dataset.moduleId) return;
      event.preventDefault();
      updateModuleAutoScroll(event);
      moduleNode.classList.add("drag-over");
    });
    moduleNode.addEventListener("dragleave", () => moduleNode.classList.remove("drag-over"));
    moduleNode.addEventListener("drop", (event) => {
      event.preventDefault();
      moduleNode.classList.remove("drag-over");
      const id = event.dataTransfer.getData("text/plain") || draggedModuleId;
      moveModuleBefore(id, moduleNode.dataset.moduleId);
      draggedModuleId = null;
      stopModuleAutoScroll();
    });
  });
  $$("[data-empty-zone]").forEach((dropZone) => {
    dropZone.addEventListener("dragover", (event) => {
      if (!draggedModuleId) return;
      event.preventDefault();
      updateModuleAutoScroll(event);
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      moveModuleToZone(draggedModuleId, dropZone.dataset.emptyZone);
      draggedModuleId = null;
      stopModuleAutoScroll();
    });
  });
}

function updateModuleAutoScroll(event) {
  if (!draggedModuleId || !event || typeof event.clientY !== "number") return;
  const edge = 110;
  const maxSpeed = 22;
  const y = event.clientY;
  const height = window.innerHeight || document.documentElement.clientHeight;
  let speed = 0;

  if (y < edge) {
    speed = -Math.ceil(((edge - y) / edge) * maxSpeed);
  } else if (y > height - edge) {
    speed = Math.ceil(((y - (height - edge)) / edge) * maxSpeed);
  }

  moduleAutoScrollSpeed = speed;
  if (speed && !moduleAutoScrollFrame) {
    moduleAutoScrollFrame = window.requestAnimationFrame(runModuleAutoScroll);
  }
  if (!speed) stopModuleAutoScroll();
}

function runModuleAutoScroll() {
  if (!draggedModuleId || !moduleAutoScrollSpeed) {
    moduleAutoScrollFrame = null;
    return;
  }
  window.scrollBy(0, moduleAutoScrollSpeed);
  moduleAutoScrollFrame = window.requestAnimationFrame(runModuleAutoScroll);
}

function stopModuleAutoScroll() {
  moduleAutoScrollSpeed = 0;
  if (moduleAutoScrollFrame) {
    window.cancelAnimationFrame(moduleAutoScrollFrame);
    moduleAutoScrollFrame = null;
  }
}

function moveModule(id, direction) {
  const modules = ensureDraftModules(state.draft);
  const module = moduleById(id);
  if (!module) return;
  const zoneModules = modules.filter((item) => item.zone === module.zone);
  const zoneIndex = zoneModules.findIndex((item) => item.id === id);
  const target = zoneModules[zoneIndex + direction];
  if (!target) return;
  const currentIndex = modules.findIndex((item) => item.id === id);
  const targetIndex = modules.findIndex((item) => item.id === target.id);
  [modules[currentIndex], modules[targetIndex]] = [modules[targetIndex], modules[currentIndex]];
  renderPreview();
  persist();
  setStatus("Ordre des modules mis à jour.");
}

function moveModuleBefore(id, targetId) {
  if (!id || !targetId || id === targetId) return;
  const modules = ensureDraftModules(state.draft);
  const currentIndex = modules.findIndex((item) => item.id === id);
  const targetIndex = modules.findIndex((item) => item.id === targetId);
  if (currentIndex < 0 || targetIndex < 0) return;
  const [module] = modules.splice(currentIndex, 1);
  const target = moduleById(targetId);
  module.zone = target ? target.zone : module.zone;
  const nextTargetIndex = modules.findIndex((item) => item.id === targetId);
  modules.splice(nextTargetIndex, 0, module);
  renderPreview();
  persist();
  setStatus("Module déplacé.");
}

function toggleModuleZone(id) {
  const module = moduleById(id);
  if (!module) return;
  module.zone = module.zone === "side" ? "main" : "side";
  renderPreview();
  persist();
  setStatus("Module déplacé dans l'autre colonne.");
}

function moveModuleToZone(id, zone) {
  const module = moduleById(id);
  if (!module || !["main", "side"].includes(zone)) return;
  module.zone = zone;
  renderPreview();
  persist();
  setStatus("Module déplacé.");
}

function deleteModule(id) {
  if (!window.confirm("Supprimer ce module du portail ?")) return;
  const modules = ensureDraftModules(state.draft);
  const index = modules.findIndex((module) => module.id === id);
  if (index < 0) return;
  modules.splice(index, 1);
  renderPreview();
  persist();
  setStatus("Module supprimé.");
}

function setActiveEditable(node, options = {}) {
  activeEditable = node;
  updateTypographyControls(!!options.showFloating);
}

function styleObjectForNode(node, create = false) {
  if (!state.draft || !node || !node.dataset.styleKey) return null;
  const [scope, id, field] = node.dataset.styleKey.split(":");
  if (scope === "field") {
    state.draft.fieldStyles = normalizeStyle(state.draft.fieldStyles);
    if (create) state.draft.fieldStyles[id] = normalizeStyle(state.draft.fieldStyles[id]);
    return state.draft.fieldStyles[id] || null;
  }
  if (scope === "module") {
    const module = moduleById(id);
    if (!module) return null;
    module.styles = normalizeStyle(module.styles);
    if (create) module.styles[field] = normalizeStyle(module.styles[field]);
    return module.styles[field] || null;
  }
  if (scope === "work") {
    const work = state.draft.works[Number(id)];
    if (!work) return null;
    work.styles = normalizeStyle(work.styles);
    if (create) work.styles[field] = normalizeStyle(work.styles[field]);
    return work.styles[field] || null;
  }
  return null;
}

function applyTextStyle(property, value) {
  if (!activeEditable || !preview.contains(activeEditable)) {
    setStatus("Sélectionnez d'abord un texte dans l'aperçu.");
    return;
  }
  const style = styleObjectForNode(activeEditable, true);
  if (!style) return;
  if (value) style[property] = value;
  else delete style[property];
  activeEditable.style[property] = value || "";
  persist();
  updateTypographyControls();
}

function toggleBoldText() {
  const style = styleObjectForNode(activeEditable, true);
  const current = style?.fontWeight || activeEditable?.style.fontWeight || "";
  applyTextStyle("fontWeight", current === "700" || current === "800" ? "" : "700");
}

function toggleItalicText() {
  const style = styleObjectForNode(activeEditable, true);
  const current = style?.fontStyle || activeEditable?.style.fontStyle || "";
  applyTextStyle("fontStyle", current === "italic" ? "" : "italic");
}

function clearActiveTextStyle() {
  if (!activeEditable || !preview.contains(activeEditable)) {
    setStatus("Sélectionnez d'abord un texte dans l'aperçu.");
    return;
  }
  const style = styleObjectForNode(activeEditable, true);
  if (style) {
    Object.keys(style).forEach((key) => delete style[key]);
  }
  ["fontWeight", "fontStyle", "fontSize", "lineHeight", "textAlign", "letterSpacing"].forEach((key) => {
    activeEditable.style[key] = "";
  });
  persist();
  updateTypographyControls();
  setStatus("Style du texte réinitialisé.");
}

function bindFloatingTextToolbar() {
  const buttonMap = [
    ["floatBoldTextBtn", toggleBoldText],
    ["floatItalicTextBtn", toggleItalicText],
    ["floatClearTextStyleBtn", clearActiveTextStyle]
  ];
  buttonMap.forEach(([id, handler]) => {
    const button = $(`#${id}`);
    if (!button) return;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", handler);
  });

  const selectMap = [
    ["floatFontWeightSelect", "fontWeight"],
    ["floatFontSizeSelect", "fontSize"],
    ["floatLineHeightSelect", "lineHeight"],
    ["floatTextAlignSelect", "textAlign"]
  ];
  selectMap.forEach(([id, property]) => {
    const control = $(`#${id}`);
    if (!control) return;
    control.addEventListener("change", (event) => applyTextStyle(property, event.target.value));
  });

  const spacing = $("#floatLetterSpacingRange");
  if (spacing) {
    spacing.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      applyTextStyle("letterSpacing", value ? `${value}px` : "");
    });
  }

  const toolbar = $("#floatingTextToolbar");
  if (toolbar) {
    toolbar.addEventListener("mouseenter", () => {
      textToolbarPointerInside = true;
      cancelFloatingTextToolbarHide();
    });
    toolbar.addEventListener("mouseleave", () => {
      textToolbarPointerInside = false;
      scheduleFloatingTextToolbarHide();
    });
    toolbar.addEventListener("mousedown", (event) => {
      if (event.target.tagName !== "SELECT" && event.target.type !== "range") {
        event.preventDefault();
      }
    });
  }
}

function trackPreviewSelection() {
  const selection = window.getSelection && window.getSelection();
  const floating = $("#floatingTextToolbar");
  if (!selection || !selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) {
    if (textToolbarPointerInside || floating?.contains(document.activeElement)) return;
    hideFloatingTextToolbar();
    return;
  }
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  const editable = element && element.closest ? element.closest("[contenteditable][data-style-key]") : null;
  if (editable && preview.contains(editable)) {
    setActiveEditable(editable, { showFloating: true });
    return;
  }
  hideFloatingTextToolbar();
}

function setControlValue(ids, value) {
  ids.forEach((id) => {
    const control = $(`#${id}`);
    if (control) control.value = value;
  });
}

function setControlDisabled(ids, disabled) {
  ids.forEach((id) => {
    const control = $(`#${id}`);
    if (control) control.disabled = disabled;
  });
}

function setButtonActive(ids, active) {
  ids.forEach((id) => {
    const button = $(`#${id}`);
    if (button) button.classList.toggle("active", active);
  });
}

function cancelFloatingTextToolbarHide() {
  if (!textToolbarHideTimer) return;
  window.clearTimeout(textToolbarHideTimer);
  textToolbarHideTimer = null;
}

function scheduleFloatingTextToolbarHide() {
  cancelFloatingTextToolbarHide();
  textToolbarHideTimer = window.setTimeout(() => {
    hideFloatingTextToolbar();
  }, 520);
}

function hideFloatingTextToolbar() {
  cancelFloatingTextToolbarHide();
  const toolbar = $("#floatingTextToolbar");
  if (toolbar) toolbar.hidden = true;
}

function maybeHideTextToolbar(event) {
  const floating = $("#floatingTextToolbar");
  const editor = $("#pageEditorToolbar");
  if (preview.contains(event.target) || floating?.contains(event.target) || editor?.contains(event.target)) return;
  activeEditable = null;
  updateTypographyControls();
}

function positionFloatingTextToolbar() {
  const toolbar = $("#floatingTextToolbar");
  if (!toolbar || toolbar.hidden || !activeEditable || !preview.contains(activeEditable)) return;
  const rect = activeSelectionRect() || activeEditable.getBoundingClientRect();
  const margin = 8;
  const top = Math.max(margin, rect.top - toolbar.offsetHeight - 6);
  const maxLeft = Math.max(margin, window.innerWidth - toolbar.offsetWidth - margin);
  const left = Math.min(maxLeft, Math.max(margin, rect.left));
  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

function activeSelectionRect() {
  const selection = window.getSelection && window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!container || !activeEditable.contains(container)) return null;
  const rect = range.getBoundingClientRect();
  return rect.width || rect.height ? rect : null;
}

function updateTypographyControls(showFloating = false) {
  const toolbar = $("#pageEditorToolbar");
  if (toolbar) toolbar.hidden = !state.draft;
  const disabled = !activeEditable || !preview.contains(activeEditable);
  ["boldTextBtn", "italicTextBtn", "fontWeightSelect", "fontSizeSelect", "lineHeightSelect", "textAlignSelect", "letterSpacingRange", "clearTextStyleBtn"].forEach((id) => {
    const control = $(`#${id}`);
    if (control) control.disabled = disabled;
  });
  setControlDisabled(["floatBoldTextBtn", "floatItalicTextBtn", "floatFontWeightSelect", "floatFontSizeSelect", "floatLineHeightSelect", "floatTextAlignSelect", "floatLetterSpacingRange", "floatClearTextStyleBtn"], disabled);
  if (disabled) {
    setControlValue(["fontWeightSelect", "floatFontWeightSelect"], "");
    setControlValue(["fontSizeSelect", "floatFontSizeSelect"], "");
    setControlValue(["lineHeightSelect", "floatLineHeightSelect"], "");
    setControlValue(["textAlignSelect", "floatTextAlignSelect"], "");
    setControlValue(["letterSpacingRange", "floatLetterSpacingRange"], 0);
    setButtonActive(["boldTextBtn", "floatBoldTextBtn"], false);
    setButtonActive(["italicTextBtn", "floatItalicTextBtn"], false);
    hideFloatingTextToolbar();
    return;
  }
  const style = styleObjectForNode(activeEditable) || {};
  setControlValue(["fontWeightSelect", "floatFontWeightSelect"], style.fontWeight || "");
  setControlValue(["fontSizeSelect", "floatFontSizeSelect"], style.fontSize || "");
  setControlValue(["lineHeightSelect", "floatLineHeightSelect"], style.lineHeight || "");
  setControlValue(["textAlignSelect", "floatTextAlignSelect"], style.textAlign || "");
  setControlValue(["letterSpacingRange", "floatLetterSpacingRange"], parseFloat(style.letterSpacing || "0") || 0);
  setButtonActive(["boldTextBtn", "floatBoldTextBtn"], style.fontWeight === "700" || style.fontWeight === "800");
  setButtonActive(["italicTextBtn", "floatItalicTextBtn"], style.fontStyle === "italic");
  const floating = $("#floatingTextToolbar");
  if (floating && showFloating) {
    floating.hidden = false;
    window.requestAnimationFrame(positionFloatingTextToolbar);
  }
}

function updateDesignChoice() {
  state.pageStyle = $("#pageStyle").value;
  state.motionStyle = $("#motionStyle").value;
  applyPreviewDesign();
  renderStyleGallery();
  persist();
  setStatus(`Le style est mis à jour : ${getDesignLabel(state.pageStyle)} / ${getMotionLabel(state.motionStyle)}.`);
}

function applyPreviewDesign() {
  const titleClass = state.fontTitle !== "default" ? " title-font-custom" : "";
  const bodyClass = state.fontBody !== "default" ? " body-font-custom" : "";
  preview.className = `portal-preview style-${state.pageStyle} motion-${state.motionStyle} layout-${state.layout}${state.palette ? " palette-custom" : ""}${titleClass}${bodyClass}`;
  applyPaletteVars();
  applyFonts();
}

function updateLayout() {
  state.layout = $("#layoutStyle").value;
  applyPreviewDesign();
  persist();
  setStatus(`${t("label.layout")} : ${t(`layout.${state.layout}`)}`);
}

function applyPaletteVars() {
  const keys = ["--portal-bg", "--portal-surface", "--portal-hero-bg", "--portal-accent", "--portal-accent-soft", "--portal-ink"];
  keys.forEach((key) => preview.style.removeProperty(key));
  const palette = state.palette;
  if (!palette) return;
  preview.style.setProperty("--portal-bg", palette.bg);
  preview.style.setProperty("--portal-surface", palette.surface);
  preview.style.setProperty("--portal-hero-bg", palette.heroBg);
  preview.style.setProperty("--portal-accent", palette.accent);
  preview.style.setProperty("--portal-accent-soft", palette.accentSoft);
  preview.style.setProperty("--portal-ink", palette.ink);
}

function updateAudience() {
  state.audience = $$(".audience-tag:checked").map((checkbox) => checkbox.value);
  persist();
  setStatus(
    state.audience.length
      ? "Public cible enregistré. Il sera intégré à la prochaine création ou regénération de la page."
      : "Public cible effacé."
  );
}

function updateStepper() {
  const stepper = $("#stepper");
  if (!stepper) return;
  const hasInput = state.messages.some((message) => message.role === "user") || messageInput.value.trim().length > 0;
  let current = 1;
  if (state.draft) current = 3;
  else if (hasInput) current = 2;

  $$("#stepper li").forEach((item) => {
    const step = Number(item.dataset.step);
    item.classList.toggle("done", step < current);
    item.classList.toggle("current", step === current);
  });
}

function getDesignLabel(value) {
  return {
    minimal: "sobre et professionnel",
    gallery: "portfolio galerie",
    editorial: "revue d'art",
    dark: "immersif sombre"
  }[value] || value;
}

function getMotionLabel(value) {
  return {
    none: "sans animation",
    subtle: "transitions douces",
    dynamic: "effet exposition"
  }[value] || value;
}

function renderHeroVisual() {
  const image = resolveHeroImage();
  if (image) {
    return `<img src="${image.dataUrl}" alt="${escapeHtml(image.alt)}">`;
  }
  return '<canvas data-generated-art="hero" width="640" height="440" aria-label="Visuel abstrait pour l’aperçu"></canvas>';
}

function resolveHeroImage() {
  const value = state.draft ? state.draft.heroImageIndex : undefined;
  if (value === -1) return undefined;
  if (Number.isInteger(value)) return state.images[value];
  return state.images[0];
}

function heroSelectionValue() {
  const value = state.draft ? state.draft.heroImageIndex : undefined;
  if (value === -1) return "-1";
  if (Number.isInteger(value)) return String(value);
  return state.images[0] ? "0" : "-1";
}

function heroImageControl() {
  if (!state.images.length) return "";
  return `<label class="visual-image-control preview-only">Image principale
    <select id="heroImageSelect">${imageOptions(heroSelectionValue())}</select></label>`;
}

function resolveWorkImage(work, index) {
  if (work.imageIndex === -1) return undefined;
  if (Number.isInteger(work.imageIndex)) return state.images[work.imageIndex];
  return state.images[index];
}

function workSelectionValue(work, index) {
  if (work.imageIndex === -1) return "-1";
  if (Number.isInteger(work.imageIndex)) return String(work.imageIndex);
  return state.images[index] ? String(index) : "-1";
}

function imageOptions(selectedValue) {
  const none = `<option value="-1"${selectedValue === "-1" ? " selected" : ""}>Aucune image</option>`;
  const options = state.images
    .map((image, index) => `<option value="${index}"${selectedValue === String(index) ? " selected" : ""}>${escapeHtml(image.alt || image.name || `Image ${index + 1}`)}</option>`)
    .join("");
  return none + options;
}

function renderWorks(works) {
  return works
    .map((work, index) => {
      const image = resolveWorkImage(work, index);
      const visual = image
        ? `<img src="${image.dataUrl}" alt="${escapeHtml(image.alt)}">`
        : `<canvas data-generated-art="work-${index}" width="420" height="310" aria-label="Visuel abstrait pour ${escapeHtml(work.title)}"></canvas>`;
      const imageControl = state.images.length
        ? `<label class="work-image-control">Image
            <select data-work-image="${index}">${imageOptions(workSelectionValue(work, index))}</select></label>`
        : "";
      return `
        <article class="work-card" data-work-index="${index}">
          ${visual}
          <div>
            <h4 contenteditable="true" data-edit-work="${index}.title" data-style-key="work:${index}:title" data-placeholder="Titre de l'œuvre"${styleAttr(work.styles?.title)}>${escapeHtml(work.title)}</h4>
            <p class="work-meta">
              <span contenteditable="true" data-edit-work="${index}.year" data-style-key="work:${index}:year" data-placeholder="Année"${styleAttr(work.styles?.year)}>${escapeHtml(work.year)}</span>
              <span aria-hidden="true"> · </span>
              <span contenteditable="true" data-edit-work="${index}.medium" data-style-key="work:${index}:medium" data-placeholder="Médium"${styleAttr(work.styles?.medium)}>${escapeHtml(work.medium)}</span>
            </p>
            <p contenteditable="true" data-edit-work="${index}.description" data-style-key="work:${index}:description" data-placeholder="Description"${styleAttr(work.styles?.description)}>${escapeHtml(work.description)}</p>
            <div class="work-tools preview-only">
              ${imageControl}
              <button type="button" class="link-btn" data-remove-work="${index}">Supprimer cette œuvre</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function bindWorkEditing() {
  $$("[data-edit-work]").forEach((node) => {
    node.setAttribute("title", "Cliquez pour modifier");
    node.addEventListener("input", () => {
      const [index, field] = node.dataset.editWork.split(".");
      const work = state.draft.works[Number(index)];
      if (!work) return;
      work[field] = node.textContent.trim();
      persist();
      renderShareKit({ keepUrlInput: true });
    });
  });

  $$("[data-remove-work]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draft.works.splice(Number(button.dataset.removeWork), 1);
      renderPreview();
      persist();
      setStatus("Œuvre supprimée du brouillon.");
    });
  });

  $$("[data-work-image]").forEach((select) => {
    select.addEventListener("change", () => {
      const index = Number(select.dataset.workImage);
      state.draft.works[index].imageIndex = Number(select.value);
      renderPreview();
      persist();
    });
  });

  const heroSelect = $("#heroImageSelect");
  if (heroSelect) {
    heroSelect.addEventListener("change", () => {
      state.draft.heroImageIndex = Number(heroSelect.value);
      renderPreview();
      persist();
    });
  }

  const addWorkBtn = $("#addWorkBtn");
  if (addWorkBtn) {
    addWorkBtn.addEventListener("click", () => {
      state.draft.works.push({ title: "Nouvelle œuvre", year: "", medium: "", description: "Description à compléter." });
      renderPreview();
      persist();
      setStatus("Une œuvre vierge a été ajoutée. Cliquez sur les champs pour la compléter.");
    });
  }
}

function renderLinks(links = []) {
  if (!links.length) return "";
  return `<ul>${links.map((link) => `<li><a href="${escapeAttribute(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a></li>`).join("")}</ul>`;
}

function suggestedPortalUrl() {
  const host = window.location.hostname;
  const isLocal = !host || host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (window.location.protocol.startsWith("http") && !isLocal) return window.location.href;
  return "";
}

function currentPortalUrl() {
  const input = $("#portalPublicUrl");
  return clean(input?.value || state.shareUrl || suggestedPortalUrl());
}

function hashtags() {
  const tags = (state.draft?.keywords || ["art", "portfolio", "artiste"])
    .slice(0, 5)
    .map((tag) =>
      `#${clean(tag)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "")
        .toLowerCase()}`
    )
    .filter((tag) => tag.length > 1);
  return Array.from(new Set(["#art", "#portfolio", ...tags])).slice(0, 7).join(" ");
}

function shortText(value, max = 180) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function shareUrlOrPlaceholder() {
  return currentPortalUrl() || "[ajoutez ici le lien public du portail]";
}

function buildShareTexts() {
  const draft = state.draft || {};
  const url = shareUrlOrPlaceholder();
  const name = draft.name || "Artiste";
  const tagline = draft.tagline || "Portail artiste";
  const statement = shortText(draft.statement || draft.bio || draft.seo || "", 220);
  const tagLine = hashtags();
  const works = (draft.works || [])
    .slice(0, 2)
    .map((work) => work.title)
    .filter(Boolean)
    .join(", ");

  return {
    linkedin: `${name} — ${tagline}\n\nJe partage mon portail professionnel : œuvres, démarche, parcours et contact réunis dans un espace stable.\n\n${statement}\n\n${works ? `Œuvres / projets à découvrir : ${works}\n\n` : ""}${url}\n\n${tagLine}`,
    instagram: `${name} · ${tagline}\nPortfolio / œuvres / contact\n${url}\n${tagLine}`,
    facebook: `Découvrez le portail de ${name}.\n\n${tagline}\n${statement}\n\nLien : ${url}\n\n${tagLine}`,
    tiktok: `${name} · ${shortText(tagline, 48)}\nPortfolio / œuvres : ${url}`
  };
}

function renderShareKit() {
  const panel = $("#shareKitPanel");
  if (!panel) return;
  panel.hidden = !state.draft;
}

async function copyText(value, message = "Copié.") {
  const text = clean(value);
  if (!text) {
    setStatus("Ajoutez d'abord un lien ou un texte à copier.");
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setStatus(message);
  } catch {
    setStatus("La copie automatique a échoué. Vous pouvez sélectionner le texte et le copier manuellement.");
  }
}

function copyPortalUrl() {
  const url = currentPortalUrl();
  if (!url) {
    setStatus("Ajoutez d'abord le lien public du portail, puis copiez-le.");
    $("#portalPublicUrl").focus();
    return;
  }
  copyText(url, "Lien du portail copié.");
}

function copyShareText(id) {
  const field = $(`#${id}`);
  copyText(field?.value || "", "Texte de partage copié.");
}

async function nativeSharePortal() {
  const texts = buildShareTexts();
  const url = currentPortalUrl();
  if (!navigator.share || !url) {
    copyText(texts.linkedin, "Texte de partage copié. Collez-le dans le réseau de votre choix.");
    return;
  }
  try {
    await navigator.share({
      title: state.draft.name || "Mon Portail Artiste",
      text: shortText(state.draft.seo || state.draft.tagline || "", 160),
      url
    });
  } catch {
    // Partage annulé par l'utilisateur : rien à signaler.
  }
}

function drawSocialCard() {
  const canvas = $("#socialCardCanvas");
  if (!canvas || !state.draft) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const palette = state.palette || buildPalette("#f7f7ff", "#000091");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.bg || "#f7f7ff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.accentSoft || "rgba(0,0,145,.12)";
  ctx.fillRect(70, 70, width - 140, height - 140);
  ctx.strokeStyle = palette.accent || "#000091";
  ctx.lineWidth = 10;
  ctx.strokeRect(70, 70, width - 140, height - 140);

  ctx.fillStyle = palette.ink || "#17201c";
  ctx.font = "700 72px Arial, sans-serif";
  wrapCanvasText(ctx, state.draft.name || "Artiste", 120, 205, 840, 84, 2);
  ctx.font = "400 38px Arial, sans-serif";
  wrapCanvasText(ctx, state.draft.tagline || "Portail artiste", 120, 330, 840, 52, 3);
  ctx.font = "400 30px Arial, sans-serif";
  wrapCanvasText(ctx, shortText(state.draft.statement || state.draft.bio || state.draft.seo || "", 210), 120, 520, 840, 42, 5);

  ctx.fillStyle = palette.accent || "#000091";
  ctx.font = "700 30px Arial, sans-serif";
  wrapCanvasText(ctx, currentPortalUrl() || "Lien du portail à ajouter", 120, 900, 840, 40, 2);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = clean(text).split(/\s+/);
  let line = "";
  let lines = 0;
  words.forEach((word) => {
    if (lines >= maxLines) return;
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
      lines += 1;
    } else {
      line = testLine;
    }
  });
  if (line && lines < maxLines) ctx.fillText(line, x, y);
}

function downloadSocialCard() {
  if (!state.draft) return;
  drawSocialCard();
  const canvas = $("#socialCardCanvas");
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${slugify(state.draft.name)}-social-card.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setStatus("Carte visuelle téléchargée.");
}

function downloadShareKit() {
  if (!state.draft) return;
  const texts = buildShareTexts();
  const content = [
    `Mon Portail Artiste - kit social`,
    `Nom : ${state.draft.name}`,
    `Lien : ${shareUrlOrPlaceholder()}`,
    "",
    "LINKEDIN",
    texts.linkedin,
    "",
    "INSTAGRAM BIO",
    texts.instagram,
    "",
    "FACEBOOK",
    texts.facebook,
    "",
    "TIKTOK BIO",
    texts.tiktok,
    "",
    "Rappel : rien n'est publié automatiquement. L'artiste doit relire, confirmer les droits d'image et publier lui-même/elle-même."
  ].join("\n");
  download(`${slugify(state.draft.name)}-kit-social.txt`, content, "text/plain");
  setStatus("Kit social téléchargé.");
}

async function handleImages(event) {
  const files = Array.from(event.target.files || []).slice(0, 6);
  if (!files.length) return;
  state.images = await Promise.all(
    files.map((file) => readCompressedImage(file).then((dataUrl) => ({ name: file.name, dataUrl, alt: `Image d'œuvre : ${file.name}` })))
  );
  renderImages();
  renderPreview();
  persist();
  persistImages();
  setStatus(`${state.images.length} image(s) ajoutée(s). Elles restent dans votre navigateur pour ce prototype.`);
}

function renderImages() {
  const strip = $("#imageStrip");
  if (!state.images.length) {
    strip.innerHTML = "";
    return;
  }
  strip.innerHTML = state.images
    .map(
      (image, index) => `
        <figure class="image-item">
          <img src="${image.dataUrl}" alt="${escapeHtml(image.alt)}">
          <button type="button" class="image-remove" data-remove-image="${index}" aria-label="Supprimer l'image ${index + 1}" title="Supprimer">×</button>
          <label class="image-alt-label">Texte alternatif
            <input type="text" class="image-alt" data-alt-image="${index}" value="${escapeAttribute(image.alt)}">
          </label>
        </figure>`
    )
    .join("");
  bindImageControls();
}

function bindImageControls() {
  $$("[data-remove-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeImage);
      state.images.splice(index, 1);
      adjustImageReferences(index);
      renderImages();
      renderPreview();
      persist();
      persistImages();
      setStatus("Image supprimée. Elle n'est plus utilisée dans l'aperçu.");
    });
  });

  $$("[data-alt-image]").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.altImage);
      if (state.images[index]) state.images[index].alt = input.value;
    });
    input.addEventListener("change", () => {
      persistImages();
      renderPreview();
    });
  });
}

function adjustImageReferences(removedIndex) {
  const fix = (value) => {
    if (!Number.isInteger(value)) return value;
    if (value === removedIndex) return -1;
    if (value > removedIndex) return value - 1;
    return value;
  };
  if (!state.draft) return;
  if (Number.isInteger(state.draft.heroImageIndex)) {
    state.draft.heroImageIndex = fix(state.draft.heroImageIndex);
  }
  (state.draft.works || []).forEach((work) => {
    if (Number.isInteger(work.imageIndex)) work.imageIndex = fix(work.imageIndex);
  });
}

function toggleVoiceInput() {
  if (!SpeechRecognitionApi) {
    setStatus("La dictée n'est pas disponible dans ce navigateur. Vous pouvez utiliser la dictée de votre appareil.");
    return;
  }

  if (state.listening) {
    state.recognition.stop();
    return;
  }

  const recognition = new SpeechRecognitionApi();
  state.recognition = recognition;
  recognition.lang = $("#voiceLang").value;
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalText = "";
  const baseText = messageInput.value.trim();

  recognition.onstart = () => {
    state.listening = true;
    $("#voiceBtn").textContent = t("voice.stop");
    setStatus("Je vous écoute. Votre texte apparaît dans le champ de message ; vous pourrez le relire avant de l'envoyer.");
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) {
        finalText = `${finalText} ${transcript}`.trim();
      } else {
        interim = `${interim} ${transcript}`.trim();
      }
    }
    messageInput.value = [baseText, finalText, interim].filter(Boolean).join(" ");
  };

  recognition.onerror = (event) => {
    setStatus(getVoiceErrorMessage(event.error));
  };

  recognition.onend = () => {
    state.listening = false;
    $("#voiceBtn").textContent = t("btn.dictate");
    if (state.guided.active && messageInput.value.trim()) {
      setStatus(t("status.voiceAutoSend"));
      sendMessage();
      return;
    }
    setStatus(finalText ? "La dictée est ajoutée. Relisez tranquillement, puis envoyez ou créez la page." : "La dictée est terminée, mais aucun texte n'a été reconnu.");
  };

  try {
    recognition.start();
  } catch {
    setStatus("La dictée semble déjà active ou le navigateur l'a bloquée.");
  }
}

function getVoiceErrorMessage(error) {
  const messages = {
    "not-allowed": "Le micro est refusé. Vous pouvez l'autoriser dans la barre d'adresse du navigateur.",
    "no-speech": "Je n'ai pas entendu de voix. Vous pouvez réessayer plus près du micro.",
    "audio-capture": "Aucun micro n'a été détecté.",
    network: "Le service de dictée est momentanément indisponible."
  };
  return messages[error] || "La dictée a été interrompue.";
}

function buildChatPrompt() {
  return `Tu aides un ou une artiste visuel(le) à décrire sa pratique en français clair, chaleureux et guidant. Pose au maximum une question courte à la fois. N'invente aucun fait. Conversation actuelle : ${JSON.stringify(state.messages)}`;
}

function buildGenerationPrompt() {
  return `Génère en français une page personnelle d'artiste, claire, accueillante et modifiable, à partir de cette conversation. Style souhaité : ${state.pageStyle}; animation : ${state.motionStyle}. Retourne un JSON avec name, location, tagline, statement, bio, goals, contact, seo, keywords, works, links, complianceNote. N'invente pas de faits de carrière. Signale que le contenu est assisté par IA et doit être relu. Conversation : ${JSON.stringify(state.messages)}`;
}

function exportJson() {
  download(
    "mon-portail-artiste.json",
    JSON.stringify(
      { messages: state.messages, draft: state.draft, images: summarizeImages(), shareUrl: state.shareUrl, pageStyle: state.pageStyle, motionStyle: state.motionStyle },
      null,
      2
    ),
    "application/json"
  );
}

function reviewConfirmed() {
  const checks = $$(".review-check");
  if (!checks.length || checks.every((check) => check.checked)) return true;
  return window.confirm(
    "Certains points de vérification avant publication ne sont pas cochés (exactitude des faits, droits d'image, relecture). Voulez-vous tout de même continuer ?"
  );
}

function buildPortalHtmlDocument() {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttribute(state.draft.seo)}">
  <title>${escapeHtml(state.draft.name)} - portail artiste</title>
${exportFontLinks()}  <style>${exportCss()}</style>
</head>
<body>
  <main class="portal-preview style-${state.pageStyle} motion-${state.motionStyle} layout-${state.layout}${state.palette ? " palette-custom" : ""}${state.fontTitle !== "default" ? " title-font-custom" : ""}${state.fontBody !== "default" ? " body-font-custom" : ""}"${previewInlineStyle()}>${getSerializablePreviewHtml()}</main>
</body>
</html>`;
}

async function exportHtml() {
  if (!reviewConfirmed()) return;
  const exportBtn = $("#exportHtmlBtn");
  try {
    setBusy(exportBtn, true, "Export en cours…");
    if (!state.draft) {
      await generatePortal();
      if (!state.draft) return;
    }
    const html = buildPortalHtmlDocument();
    download(`${slugify(state.draft.name)}-artist-portal.html`, html, "text/html");
    warnExportWeight(html);
  } finally {
    setBusy(exportBtn, false);
  }
}

async function publishPage() {
  if (!state.draft) {
    setStatus(t("publish.needPage"));
    return;
  }
  if (!PUBLISH_ENDPOINT) {
    setStatus(t("publish.notConfigured"));
    return;
  }
  if (!reviewConfirmed()) return;
  const button = $("#publishBtn");
  try {
    setBusy(button, true, t("publish.inProgress"));
    const html = buildPortalHtmlDocument();
    const response = await fetch(`${PUBLISH_ENDPOINT.replace(/\/$/, "")}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html })
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || `HTTP ${response.status}`);
    }
    const payload = await response.json();
    state.shareUrl = payload.url;
    renderShareKit();
    persist();
    await copyText(payload.url, t("publish.done"));
  } catch (error) {
    setStatus(`${t("publish.failed")} ${error.message}`);
  } finally {
    setBusy(button, false);
  }
}

function warnExportWeight(html) {
  const sizeMo = new Blob([html]).size / (1024 * 1024);
  if (sizeMo >= 2) {
    setStatus(`Fichier HTML exporté (~${sizeMo.toFixed(1)} Mo). Les images sont intégrées dans le fichier : pour un site en ligne, préférez des images séparées et optimisées.`);
  }
}

function warnExportWeight(html) {
  const sizeMo = new Blob([html]).size / (1024 * 1024);
  if (sizeMo >= 2) {
    setStatus(`Fichier HTML exporté (~${sizeMo.toFixed(1)} Mo). Les images sont intégrées dans le fichier : pour un site en ligne, préférez des images séparées et optimisées.`);
  }
}

function previewInlineStyle() {
  const vars = [];
  const p = state.palette;
  if (p) {
    vars.push(`--portal-bg:${p.bg}`, `--portal-surface:${p.surface}`, `--portal-hero-bg:${p.heroBg}`, `--portal-accent:${p.accent}`, `--portal-accent-soft:${p.accentSoft}`, `--portal-ink:${p.ink}`);
  }
  const title = FONTS[state.fontTitle];
  const body = FONTS[state.fontBody];
  if (title && title.stack) vars.push(`--portal-font-title:${title.stack}`);
  if (body && body.stack) vars.push(`--portal-font-body:${body.stack}`);
  // Attribut en guillemets simples : les piles de polices contiennent des guillemets doubles.
  return vars.length ? ` style='${vars.join(";")}'` : "";
}

function exportFontLinks() {
  const links = new Set();
  [state.fontTitle, state.fontBody].forEach((id) => {
    const font = FONTS[id];
    if (font && font.google) {
      links.add(`  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.google}&display=swap">`);
    }
  });
  return links.size ? `${Array.from(links).join("\n")}\n` : "";
}

function getSerializablePreviewHtml() {
  const clone = preview.cloneNode(true);
  clone.querySelectorAll(".edit-hint, .preview-only").forEach((node) => node.remove());
  const originalCanvases = Array.from(preview.querySelectorAll("canvas"));
  Array.from(clone.querySelectorAll("canvas")).forEach((canvas, index) => {
    const image = document.createElement("img");
    image.src = originalCanvases[index]?.toDataURL("image/png") || "";
    image.alt = canvas.getAttribute("aria-label") || "Image d'œuvre";
    canvas.replaceWith(image);
  });
  clone.querySelectorAll("[contenteditable]").forEach((node) => {
    node.removeAttribute("contenteditable");
    node.removeAttribute("data-edit");
    node.removeAttribute("data-edit-module");
    node.removeAttribute("data-edit-work");
    node.removeAttribute("data-style-key");
    node.removeAttribute("data-placeholder");
    node.removeAttribute("title");
    node.removeAttribute("aria-label");
  });
  clone.querySelectorAll("[data-module-id], [data-module-zone], [draggable]").forEach((node) => {
    node.removeAttribute("data-module-id");
    node.removeAttribute("data-module-zone");
    node.removeAttribute("draggable");
  });
  return clone.innerHTML;
}

function exportCss() {
  return `body{margin:0;font-family:Arial,sans-serif;color:#17201c;background:#fbfaf6;line-height:1.55}.portal-preview{max-width:1100px;margin:0 auto;background:white;overflow:hidden}.portal-hero{display:grid;grid-template-columns:1fr .7fr;gap:1rem;padding:2rem;background:#f4f0e8}.portal-hero h2{font-size:clamp(2rem,5vw,4.4rem);line-height:1.05}.portal-body{display:grid;grid-template-columns:1fr 320px;gap:1rem;padding:2rem}.portal-column{display:grid;gap:.85rem;align-content:start}.module-body{margin-bottom:0}.portal-visual img,.portal-visual canvas,.work-card img{width:100%;display:block;object-fit:cover}.work-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.8rem}.work-card,.side-box{border:1px solid #d7ded8;padding:.8rem;margin-bottom:.8rem}.generated-note{display:inline-block;background:#fff7d7;border:1px solid #e6c957;padding:.25rem .5rem}.tag-list{display:flex;gap:.4rem;flex-wrap:wrap;padding:0;list-style:none}.tag-list li{background:#e8eee9;border-radius:999px;padding:.3rem .5rem}.style-gallery .portal-hero{grid-template-columns:1fr;background:white}.style-gallery .portal-visual{min-height:360px}.style-gallery .portal-body{grid-template-columns:1fr}.style-gallery .work-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.style-editorial{background:#fff8ed}.style-editorial .portal-hero{background:#f5e6cf}.style-editorial .portal-hero h2,.style-editorial h3{font-family:Georgia,"Times New Roman",serif}.style-editorial .side-box{background:transparent;border-width:0 0 0 4px;border-color:#8f5d3f}.style-dark{background:#111716;color:#f4f0e8}.style-dark .portal-hero{background:#17201c}.style-dark .side-box,.style-dark .work-card{background:#18231f;border-color:#34433e}.style-dark p,.style-dark li{color:#d9e0dc}.style-dark .tag-list li{background:#26352f}.motion-subtle .portal-hero,.motion-subtle .portal-section,.motion-subtle .side-box,.motion-subtle .work-card{animation:fadeUp 520ms ease both}.motion-dynamic .portal-hero{animation:fadeUp 700ms ease both}.motion-dynamic .portal-visual img,.motion-dynamic .portal-visual canvas{animation:slowDrift 9s ease-in-out infinite alternate}.motion-dynamic .work-card{animation:floatIn 720ms ease both}.motion-dynamic .work-card:nth-child(2){animation-delay:120ms}.motion-dynamic .work-card:nth-child(3){animation-delay:240ms}.motion-dynamic .generated-note{animation:softPulse 2.4s ease-in-out infinite}.motion-none *{animation:none!important;transition:none!important}@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes floatIn{from{opacity:0;transform:translateY(22px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes slowDrift{from{transform:scale(1.01) translate3d(-4px,-3px,0)}to{transform:scale(1.06) translate3d(5px,4px,0)}}@keyframes softPulse{0%,100%{box-shadow:0 0 0 rgba(243,207,90,0)}50%{box-shadow:0 0 0 6px rgba(243,207,90,.24)}}@media(max-width:760px){.portal-hero,.portal-body{grid-template-columns:1fr;padding:1rem}}@media(prefers-reduced-motion:reduce){.portal-preview *{animation:none!important;transition:none!important}}.palette-custom{background:var(--portal-bg)!important;color:var(--portal-ink)!important}.palette-custom .portal-hero{background:var(--portal-hero-bg)!important}.palette-custom .portal-hero p,.palette-custom .portal-section,.palette-custom .portal-section p,.palette-custom .portal-body,.palette-custom .side-box,.palette-custom .side-box p,.palette-custom .work-card,.palette-custom .work-card p{color:var(--portal-ink)!important}.palette-custom .portal-section h3,.palette-custom .side-box h3,.palette-custom .work-card h4{color:var(--portal-accent)!important}.palette-custom .side-box,.palette-custom .work-card{background:var(--portal-surface)!important;border-color:var(--portal-accent-soft)!important}.palette-custom .tag-list li{background:var(--portal-accent-soft)!important;color:var(--portal-ink)!important}.portal-preview.layout-centre .portal-hero,.portal-preview.layout-affiche .portal-hero{grid-template-columns:1fr;text-align:center;justify-items:center}.portal-preview.layout-centre .portal-body,.portal-preview.layout-affiche .portal-body,.portal-preview.layout-mosaique .portal-body,.portal-preview.layout-defilement .portal-body{grid-template-columns:minmax(0,1fr)}.portal-preview.layout-centre .portal-body{max-width:820px;margin:0 auto}.portal-preview.layout-affiche .portal-hero h2{font-size:clamp(3rem,10vw,6.5rem);line-height:1}.portal-preview.layout-mosaique .work-grid{display:block;column-count:3;column-gap:.8rem;grid-template-columns:none}.portal-preview.layout-mosaique .work-card{break-inside:avoid;margin-bottom:.8rem}.portal-preview.layout-mosaique .work-card img,.portal-preview.layout-mosaique .work-card canvas{aspect-ratio:auto;height:auto}.portal-preview.layout-defilement .work-grid{display:flex;grid-template-columns:none;overflow-x:auto;gap:1rem;padding-bottom:.6rem;scroll-snap-type:x mandatory}.portal-preview.layout-defilement .work-card{flex:0 0 clamp(220px,60%,300px);scroll-snap-align:start}@media(max-width:760px){.portal-preview.layout-mosaique .work-grid{column-count:1}}.portal-preview.body-font-custom{font-family:var(--portal-font-body)!important}.portal-preview.title-font-custom .portal-hero h2,.portal-preview.title-font-custom .portal-section h3,.portal-preview.title-font-custom .side-box h3,.portal-preview.title-font-custom .work-card h4,.portal-preview.title-font-custom .portal-hero [data-edit="tagline"]{font-family:var(--portal-font-title)!important}.portal-preview.layout-editorial .portal-body{grid-template-columns:minmax(0,1fr);max-width:900px;margin:0 auto;gap:2.4rem}.portal-preview.layout-editorial .portal-section,.portal-preview.layout-editorial .side-box{border:0;background:transparent;margin:0;padding-left:0;padding-right:0}.portal-preview.layout-editorial .portal-section>h3,.portal-preview.layout-editorial .side-box>h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;font-weight:600;color:#5b6660;margin-bottom:.5rem}.portal-preview.layout-editorial [data-legacy="statement"]>h3{display:none}.portal-preview.layout-editorial [data-legacy="statement"] .module-body{font-size:clamp(1.25rem,2.3vw,1.8rem);line-height:1.5;font-weight:500}.portal-preview.layout-editorial .portal-side{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.6rem 2.4rem}`;
}

function clearLocalData() {
  if (!window.confirm("Effacer la conversation, le brouillon de page et les images enregistrés localement ?")) return;
  localStorage.removeItem(STORAGE_KEY);
  idbDelete(IMAGES_KEY).catch(() => {});
  state.messages = [];
  state.draft = null;
  state.images = [];
  state.audience = [];
  state.works = [];
  state.palette = null;
  state.paletteIntensity = 0.35;
  state.person = "third";
  state.profession = "artiste";
  $("#professionStyle").value = "artiste";
  state.layout = "editorial";
  $("#layoutStyle").value = "editorial";
  state.fontTitle = "default";
  state.fontBody = "default";
  state.shareUrl = "";
  $("#titleFont").value = "default";
  $("#bodyFont").value = "default";
  state.guided = { active: false, step: 0 };
  state.guidedAnswers = {};
  state.extra = "";
  $("#extraField").value = "";
  state.speak = false;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  $("#speakToggle").checked = false;
  $("#guidedBtn").textContent = t("guided.start");
  state.pageStyle = "minimal";
  state.motionStyle = "subtle";
  messageInput.value = "";
  $("#llmEndpoint").value = "";
  $("#pageStyle").value = state.pageStyle;
  $("#motionStyle").value = state.motionStyle;
  $("#personStyle").value = state.person;
  $("#layoutStyle").value = state.layout;
  $$(".audience-tag").forEach((checkbox) => (checkbox.checked = false));
  $("#bgIntensity").value = 35;
  renderPaletteSwatches();
  renderWorksInput();
  renderMessages();
  renderPreview();
  renderImages();
  updateGenerateLabel();
  setStatus("Le contenu local est effacé. Vous pouvez recommencer quand vous voulez.");
}

function persist() {
  // Texte léger dans localStorage ; images volumineuses dans IndexedDB (voir persistImages).
  const payload = {
    messages: state.messages,
    draft: state.draft,
    audience: state.audience,
    works: state.works,
    palette: state.palette,
    paletteIntensity: state.paletteIntensity,
    person: state.person,
    profession: state.profession,
    layout: state.layout,
    fontTitle: state.fontTitle,
    fontBody: state.fontBody,
    shareUrl: state.shareUrl,
    guided: state.guided,
    guidedAnswers: state.guidedAnswers,
    extra: state.extra,
    speak: state.speak,
    pageStyle: state.pageStyle,
    motionStyle: state.motionStyle,
    endpoint: $("#llmEndpoint").value.trim()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    setStatus("L'espace local est saturé : la dernière modification n'a peut-être pas été sauvegardée.");
  }
}

function persistImages() {
  idbSet(IMAGES_KEY, state.images).catch(() => {
    setStatus("Les images n'ont pas pu être sauvegardées dans ce navigateur (mode privé ?). Elles restent actives pour cette session.");
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    state.messages = saved.messages || [];
    state.draft = saved.draft || null;
    state.images = saved.images || []; // ancien format : images encore dans localStorage
    state.audience = saved.audience || [];
    state.works = saved.works || [];
    state.palette = saved.palette || null;
    state.paletteIntensity = typeof saved.paletteIntensity === "number" ? saved.paletteIntensity : 0.35;
    state.person = saved.person || "third";
    state.profession = saved.profession || "artiste";
    $("#professionStyle").value = state.profession;
    state.layout = saved.layout || "standard";
    state.fontTitle = saved.fontTitle || "default";
    state.fontBody = saved.fontBody || "default";
    state.shareUrl = saved.shareUrl || "";
    $("#titleFont").value = state.fontTitle;
    $("#bodyFont").value = state.fontBody;
    state.guided = saved.guided && typeof saved.guided === "object" ? saved.guided : { active: false, step: 0 };
    state.guidedAnswers = saved.guidedAnswers && typeof saved.guidedAnswers === "object" ? saved.guidedAnswers : {};
    state.extra = saved.extra || "";
    $("#extraField").value = state.extra;
    state.speak = !!saved.speak;
    $("#speakToggle").checked = state.speak;
    $("#guidedBtn").textContent = state.guided.active ? "Quitter le mode guidé" : "Conversation guidée";
    state.pageStyle = saved.pageStyle || "minimal";
    state.motionStyle = saved.motionStyle || "subtle";
    $("#pageStyle").value = state.pageStyle;
    $("#motionStyle").value = state.motionStyle;
    $("#personStyle").value = state.person;
    $("#layoutStyle").value = state.layout;
    $("#llmEndpoint").value = saved.endpoint || "";
    $$(".audience-tag").forEach((checkbox) => {
      checkbox.checked = state.audience.includes(checkbox.value);
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function loadImages() {
  try {
    const images = await idbGet(IMAGES_KEY);
    if (Array.isArray(images) && images.length) {
      state.images = images;
      renderImages();
      renderPreview();
    }
  } catch {
    // IndexedDB indisponible : on garde les éventuelles images du format hérité.
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const request = tx.objectStore(IDB_STORE).get(key);
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function readCompressedImage(file) {
  return readFile(file).then(
    (dataUrl) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          const maxSide = 1200;
          const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * ratio));
          canvas.height = Math.max(1, Math.round(image.height * ratio));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
      })
  );
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function drawEmptyCanvas() {
  const canvas = $(".empty-preview canvas");
  if (canvas) drawArtCanvas(canvas, 0);
}

function drawGeneratedCanvases() {
  $$("canvas[data-generated-art]").forEach((canvas, index) => drawArtCanvas(canvas, index + 1));
}

function artPalette() {
  const p = state.palette;
  if (!p) {
    return { colors: ["#f3cf5a", "#2d6b52", "#1d4f91", "#b8495b", "#8f5d3f", "#f5f0e8"], bg: "#fffdf8", stroke: "#17201c" };
  }
  return {
    colors: [
      p.accent,
      mix(p.accent, p.ink, 0.25),
      mix(p.accent, "#ffffff", 0.35),
      mix(p.bg, p.ink, 0.3),
      p.surface,
      mix(p.bg, p.accent, 0.25)
    ],
    bg: mix(p.bg, "#ffffff", 0.3),
    stroke: p.ink
  };
}

function drawArtCanvas(canvas, seed) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const theme = artPalette();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 10; i += 1) {
    const x = ((seed + 3) * (i + 2) * 37) % width;
    const y = ((seed + 5) * (i + 4) * 29) % height;
    const w = 50 + (((seed + i) * 41) % 140);
    const h = 36 + (((seed + i) * 53) % 120);
    ctx.fillStyle = theme.colors[(seed + i) % theme.colors.length];
    ctx.globalAlpha = 0.78;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.stroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.1, height * 0.72);
  ctx.bezierCurveTo(width * 0.35, height * 0.18, width * 0.55, height * 0.88, width * 0.9, height * 0.28);
  ctx.stroke();
}

function extractWorks(text) {
  const matches = [];
  const normalized = text.replaceAll("；", ";").replaceAll("。", "\n");
  const workPattern = /([^。\n;,，]{2,40}?)[,，]\s*(20\d{2}|19\d{2})[,，]\s*([^。\n;,，]{2,30})(?:[,，]\s*([^。\n;]{4,120}))?/g;
  let match = workPattern.exec(normalized);
  while (match) {
    matches.push({
      title: clean(match[1]),
      year: clean(match[2]),
      medium: clean(match[3]),
      description: clean(match[4]) || "Description à compléter."
    });
    match = workPattern.exec(normalized);
  }
  return matches.slice(0, 6);
}

function extractLinks(text) {
  return Array.from(text.matchAll(/https?:\/\/[^\s，。)）]+/g)).map((match) => match[0]);
}

function extractKeywords(text) {
  const stop = new Set(["artiste", "œuvre", "oeuvre", "travail", "avec", "pour", "dans", "les", "des", "une", "vous", "votre", "visual", "artist", "with"]);
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stop.has(word))
    .slice(0, 10);
}

function findKeywords(text, words) {
  return words.filter((word) => text.includes(word));
}

function matchFirst(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function summarizeImages() {
  return state.images.map((image) => ({ name: image.name, alt: image.alt }));
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setStatus(message) {
  statusBox.textContent = message;
}

function setBusy(button, isBusy, busyLabel) {
  if (!button) return;
  if (isBusy) {
    button.dataset.idleLabel = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (busyLabel) button.textContent = busyLabel;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.idleLabel !== undefined) {
      button.textContent = button.dataset.idleLabel;
      delete button.dataset.idleLabel;
    }
  }
}

function updateGenerateLabel() {
  const button = $("#generateBtn");
  if (button) button.textContent = state.draft ? t("btn.regenerate") : t("btn.create");
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function slugify(value) {
  return String(value || "artist-portal")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

init();
