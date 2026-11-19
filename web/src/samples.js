// Sample paragraphs for the playground. Each one uses real articles from the bundled corpus.
// test/web.test.js runs every sample through the Node verifier and asserts at least one flagged verdict.
export const SAMPLES = [
  {
    id: 'eu', label: 'EU GDPR & AI Act', country: 'EU',
    text: [
      'Under GDPR Article 33: "In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach to the supervisory authority"',
      'Under GDPR Article 5, controllers must notify personal data breaches to the supervisory authority not later than 72 hours after becoming aware of the personal data breach.',
      'GDPR Article 105 imposes mandatory criminal imprisonment for late breach reporting.',
      'Under EU AI Act Article 5, providers of high-risk AI systems shall establish, implement, document and maintain a risk management system throughout the entire lifecycle of a high-risk AI system.',
    ].join('\n'),
  },
  {
    id: 'us', label: 'US FRCP Rule 11', country: 'US',
    text: [
      'Under FRCP Rule 11: "Every pleading, written motion, and other paper must be signed by at least one attorney of record in the attorney\'s name—or by a party personally if the party is unrepresented."',
      'Under FRCP Rule 84, the forms in the Appendix suffice under these rules and illustrate the simplicity and brevity that these rules contemplate.',
      'FRCP Rule 99 mandates automatic disbarment for any AI-assisted brief filed without prior leave of court.',
    ].join('\n'),
  },
  {
    id: 'vn', label: 'Vietnam memo', country: 'VN',
    text: [
      'Under Article 9 of Law No. 91/2025/QH15 on Personal Data Protection: "Sự đồng ý của chủ thể dữ liệu cá nhân là việc chủ thể dữ liệu cá nhân cho phép xử lý dữ liệu cá nhân của mình"',
      'Article 20 of Law No. 91/2025/QH15 governs cross-border transfers of personal data held in Vietnam.',
      'Article 99 of Law No. 91/2025/QH15 sets a five-year record-keeping duty for consent logs.',
      'Consent records must also follow Article 11 of Decree 13/2023/ND-CP on personal data protection.',
    ].join('\n'),
  },
  {
    id: 'id', label: 'Indonesia memo', country: 'ID',
    text: [
      'Pasal 5 UU No. 27 Tahun 2022: Subjek Data Pribadi berhak menarik kembali persetujuan pemrosesan Data Pribadi tentang dirinya yang telah diberikan kepada Pengendali Data Pribadi.',
      'Pasal 20 UU No. 27 Tahun 2022 mewajibkan Pengendali Data Pribadi memiliki dasar pemrosesan Data Pribadi.',
    ].join('\n'),
  },
  {
    id: 'th', label: 'Thailand memo', country: 'TH',
    text: [
      'Section 19 of the Personal Data Protection Act B.E. 2562: "The Data Controller shall not collect, use, or disclose Personal Data, unless the data subject has given consent prior to or at the time of such collection"',
      'Section 26 of the Personal Data Protection Act B.E. 2562: "The Data Controller may freely collect religious and health data without consent when it is used for marketing purposes"',
    ].join('\n'),
  },
  {
    id: 'zh', label: 'Chinese answer', country: '',
    text: [
      '根据越南《个人数据保护法》（第91/2025/QH15号法律）第99条，企业必须将同意记录保存五年。',
      '泰国《个人数据保护法》（佛历2562年）第19条规定，数据控制者在收集个人数据前必须取得数据主体的同意。',
    ].join('\n'),
  },
];
