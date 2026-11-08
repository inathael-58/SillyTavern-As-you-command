// คลังคำสั่ง OOC สำเร็จรูป
// title / desc เป็นภาษาไทยไว้ให้คนอ่าน ส่วน text (ตัวที่ส่งให้โมเดล) เป็นภาษาอังกฤษเพื่อประหยัดโทเคน
// และให้โมเดลเกือบทุกตัวตีความได้แม่น — แก้เป็นไทยเองได้หลังเพิ่มเข้าลิสต์
//
// group: คำสั่งที่อยู่กลุ่มเดียวกันเปิดได้ทีละอัน (เปิดอันใหม่ อันเก่าปิดเอง)
// once:  ใช้ครั้งเดียว — ปิดตัวเองหลังบอทตอบ 1 ข้อความ
// seed:  ใส่ไว้ในลิสต์ "ทุกแชท" ให้ตอนติดตั้งครั้งแรก (ปิดไว้ทั้งหมด)

export const CATEGORIES = [
    { id: 'style', label: 'สไตล์การเขียน', icon: 'fa-pen-nib' },
    { id: 'char', label: 'ตัวละคร', icon: 'fa-masks-theater' },
    { id: 'plot', label: 'เนื้อเรื่อง', icon: 'fa-book-open' },
    { id: 'thai', label: 'ภาษาไทย', icon: 'fa-language' },
    { id: 'format', label: 'รูปแบบ', icon: 'fa-align-left' },
    { id: 'once', label: 'ใช้ครั้งเดียว', icon: 'fa-bolt' },
];

export const STARTERS = [
    // ── สไตล์การเขียน ──
    {
        id: 'no-user-control', cat: 'style', seed: true,
        title: 'ห้ามพูด/ทำแทนผู้เล่น',
        desc: 'กันบอทเขียนบทพูด ความคิด หรือการกระทำของเรา',
        text: "Never write {{user}}'s dialogue, actions, thoughts or feelings. Control only {{char}} and NPCs; leave every choice of {{user}} to the player.",
    },
    {
        id: 'anti-repeat', cat: 'style', seed: true,
        title: 'ห้ามวนซ้ำ',
        desc: 'ลดประโยคเปิดซ้ำ คำบรรยายเดิม อารมณ์วนลูป',
        text: 'Do not reuse phrases, sentence openings, descriptions or emotional beats from earlier replies. Vary sentence rhythm and structure.',
    },
    {
        id: 'show-dont-tell', cat: 'style', seed: true,
        title: "Show, don't tell",
        desc: 'สื่ออารมณ์ผ่านการกระทำ ภาษากาย และรายละเอียดผัสสะ',
        text: 'Convey emotion through action, body language, dialogue and sensory detail instead of naming feelings directly. Use subtext.',
    },
    {
        id: 'hook-end', cat: 'style', seed: true,
        title: 'จบให้เราได้เล่นต่อ',
        desc: 'ไม่ปิดฉากเอง เว้นจังหวะให้ผู้เล่นตอบ',
        text: "End each reply at a natural point that invites {{user}} to respond. Do not resolve the scene or decide outcomes on {{user}}'s behalf.",
    },
    {
        id: 'short-reply', cat: 'style', group: 'length',
        title: 'ตอบสั้น กระชับ',
        desc: '1–3 ย่อหน้า เน้นช่วงเวลาปัจจุบัน',
        text: 'Keep each reply short: 1–3 paragraphs, focused on the current moment.',
    },
    {
        id: 'long-reply', cat: 'style', group: 'length',
        title: 'ตอบยาว ละเอียด',
        desc: '4–6 ย่อหน้า บรรยายเต็มอิ่ม',
        text: 'Write rich, detailed replies of 4–6 paragraphs with vivid description and inner texture.',
    },
    {
        id: 'no-purple', cat: 'style',
        title: 'ภาษาไม่เยิ่นเย้อ',
        desc: 'ตัดคำฟุ่มเฟือย สำนวนเกร่อ',
        text: 'Prefer clear, concrete prose over flowery or purple writing. Cut clichés and filler adjectives.',
    },

    // ── ตัวละคร ──
    {
        id: 'stay-in-char', cat: 'char', seed: true,
        title: 'รักษาคาแรกเตอร์',
        desc: 'นิสัย น้ำเสียง วิธีพูด ต้องคงที่ตามการ์ด',
        text: "Keep {{char}}'s personality, voice, speech patterns and knowledge consistent with their established description. Do not soften them out of character.",
    },
    {
        id: 'no-pushover', cat: 'char',
        title: 'ไม่ยอมตามใจง่าย',
        desc: 'ตัวละครมีความคิดของตัวเอง ปฏิเสธหรือเถียงได้',
        text: '{{char}} has their own goals, boundaries and opinions. They may disagree, refuse, tease or push back; do not make them automatically agreeable to {{user}}.',
    },
    {
        id: 'living-npc', cat: 'char',
        title: 'NPC มีชีวิต',
        desc: 'NPC มีแรงจูงใจ โลกขยับแม้เราอยู่เฉย',
        text: 'NPCs act on their own motives and react independently. The world keeps moving even when {{user}} is passive.',
    },
    {
        id: 'no-positivity', cat: 'char',
        title: 'ไม่ฝืนโลกสวย',
        desc: 'ปล่อยให้มีความขัดแย้ง ล้มเหลว อารมณ์ค้าง',
        text: 'Avoid forced positivity and neat resolutions. Allow conflict, failure, awkwardness and unresolved emotions to stand.',
    },
    {
        id: 'slow-burn', cat: 'char',
        title: 'Slow burn',
        desc: 'ความรักค่อยๆ ก่อตัว ไม่สารภาพหรือรุกเร็ว',
        text: 'Keep romance slow-burn: let attraction and tension build gradually through small moments. No sudden confessions or rushed intimacy.',
    },

    // ── เนื้อเรื่อง ──
    {
        id: 'proactive', cat: 'plot', group: 'pace',
        title: 'ขับเคลื่อนเรื่องเอง',
        desc: 'บอทใส่เหตุการณ์ ปม เบาะแส ตัวละครใหม่',
        text: 'Be proactive: introduce events, complications, clues or new characters to drive the plot forward instead of waiting on {{user}}.',
    },
    {
        id: 'slow-pace', cat: 'plot', group: 'pace',
        title: 'ค่อยเป็นค่อยไป',
        desc: 'อยู่กับฉากปัจจุบัน ไม่ข้ามเวลา ไม่รีบ',
        text: 'Slow the pacing. Stay in the current moment and explore it fully; no time skips or rushing to the next scene.',
    },
    {
        id: 'continuity', cat: 'plot',
        title: 'จำรายละเอียดให้แม่น',
        desc: 'ชื่อ แผล สิ่งของ เวลา สถานที่ ห้ามขัดกับที่ผ่านมา',
        text: 'Stay consistent with established facts: names, injuries, items, time of day, locations and past events. Do not contradict earlier story details.',
    },

    // ── ภาษาไทย ──
    {
        id: 'reply-thai', cat: 'thai', seed: true,
        title: 'ตอบเป็นภาษาไทย',
        desc: 'บรรยายและบทพูดเป็นไทยทั้งหมด ชื่อคงเดิม',
        text: 'Write all narration and dialogue in natural, fluent Thai. Keep proper names as given.',
    },
    {
        id: 'thai-register', cat: 'thai',
        title: 'สรรพนาม/หางเสียงคงที่',
        desc: 'ครับ/ค่ะ ข้า/เจ้า ฉัน/ผม ไม่เปลี่ยนไปมา',
        text: "Keep each character's Thai pronouns, particles and speech register (e.g. ครับ/ค่ะ/จ้ะ, ข้า/เจ้า, ฉัน/ผม) consistent with how they have spoken so far.",
    },
    {
        id: 'thai-no-space', cat: 'thai',
        title: 'ไม่เว้นวรรครอบชื่อ',
        desc: 'เขียนชื่อติดคำรอบข้างแบบภาษาไทยปกติ',
        text: 'In Thai text, do not put spaces before or after character names; join them to the surrounding words as in normal Thai prose.',
    },
    {
        id: 'thai-natural', cat: 'thai',
        title: 'ไทยไม่ติดสำนวนแปล',
        desc: 'ลำดับประโยคและสำนวนแบบคนไทยเขียน',
        text: 'Avoid translated-sounding Thai. Use idiomatic phrasing and natural Thai sentence order; do not calque English structures.',
    },

    // ── รูปแบบ ──
    {
        id: 'format-rp', cat: 'format',
        title: '*การกระทำ* "บทพูด"',
        desc: 'บรรยายในดอกจัน บทพูดในเครื่องหมายคำพูด',
        text: 'Format: actions and narration in *asterisks*, spoken dialogue in "quotes".',
    },
    {
        id: 'third-person', cat: 'format', group: 'pov',
        title: 'บรรยายบุรุษที่ 3',
        desc: 'เล่าแบบบุคคลที่สาม',
        text: 'Write narration in third person, past tense.',
    },
    {
        id: 'second-person', cat: 'format', group: 'pov',
        title: 'บรรยายบุรุษที่ 2 (คุณ)',
        desc: 'เล่าโดยเรียกผู้เล่นว่า "คุณ"',
        text: 'Write narration in second person, addressing {{user}} as "you".',
    },
    {
        id: 'no-meta', cat: 'format',
        title: 'ห้ามพูดนอกบท',
        desc: 'ไม่มีหมายเหตุ คำเตือน หรือถามว่าจะเอายังไงต่อ',
        text: 'No meta commentary, disclaimers, OOC notes or questions to the player about what happens next. Stay inside the story.',
    },

    // ── ใช้ครั้งเดียว ──
    {
        id: 'time-skip', cat: 'once', once: true,
        title: 'ข้ามเวลา',
        desc: 'ตัดไปช่วงสำคัญถัดไป',
        text: 'In the next reply, skip ahead to the next meaningful moment in the story and briefly bridge the gap.',
    },
    {
        id: 'scene-change', cat: 'once', once: true,
        title: 'เปลี่ยนฉาก',
        desc: 'ปิดฉากนี้ ไปฉาก/สถานที่ใหม่',
        text: 'In the next reply, wrap up the current scene and transition to a new scene or location.',
    },
    {
        id: 'twist', cat: 'once', once: true,
        title: 'หักมุม',
        desc: 'เหตุการณ์ไม่คาดฝันแต่สมเหตุผล',
        text: 'In the next reply, introduce an unexpected but plausible twist that raises the stakes.',
    },
    {
        id: 'npc-enter', cat: 'once', once: true,
        title: 'ให้ NPC เข้าฉาก',
        desc: 'ดึงตัวละครใหม่หรือเก่าเข้ามามีบทบาท',
        text: 'In the next reply, bring a new or existing NPC into the scene in a way that matters to the plot.',
    },
    {
        id: 'recap', cat: 'once', once: true,
        title: 'สรุปสถานการณ์ (นอกบท)',
        desc: 'หยุดเล่น 1 ข้อความ สรุปฉาก ความสัมพันธ์ ปมค้าง',
        text: 'Pause the roleplay for this reply only. Out of character, briefly summarize the current scene, relationships and open plot threads as a short list.',
    },
];
