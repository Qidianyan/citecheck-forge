// Curated bilingual legal-term anchors: Chinese concept → official-language terms (vi / id / th) used in the
// bundled statutes. Lets a Chinese paraphrase of a Vietnamese/Indonesian/Thai article be compared on concepts,
// deterministically. Each term must occur in the corpus (checked by test/glossary.test.js).
// Order: more specific concepts first. Keep entries short and unambiguous.
export const GLOSSARY = [
  // --- data protection ---
  { zh: ['撤回同意', '撤回其同意', '撤销同意'], vi: ['rút lại sự đồng ý'], id: ['menarik kembali persetujuan'], th: ['ถอนความยินยอม'] },
  { zh: ['同意'], vi: ['sự đồng ý'], id: ['persetujuan'], th: ['ความยินยอม'] },
  { zh: ['敏感个人数据', '敏感数据', '敏感个人信息'], vi: ['dữ liệu cá nhân nhạy cảm'], id: ['data pribadi yang bersifat spesifik'], th: ['ข้อมูลส่วนบุคคลเกี่ยวกับเชื้อชาติ'] },
  { zh: ['儿童', '未成年人', '未满'], vi: ['trẻ em'], id: ['anak'], th: ['ผู้เยาว์'] },
  { zh: ['数据保护官', 'DPO'], vi: ['bộ phận bảo vệ dữ liệu cá nhân'], id: ['pejabat atau petugas'], th: ['เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล'] },
  { zh: ['跨境', '境外', '传输到国外', '向境外', '转移至国外', '国外传输'], vi: ['chuyển dữ liệu cá nhân ra nước ngoài'], id: ['transfer data pribadi', 'luar wilayah hukum'], th: ['ส่งหรือโอนข้อมูลส่วนบุคคลไปยังต่างประเทศ'] },
  { zh: ['泄露', '数据泄露', '泄漏'], vi: ['vi phạm quy định về bảo vệ dữ liệu cá nhân'], id: ['kegagalan pelindungan data pribadi'], th: ['การละเมิดข้อมูลส่วนบุคคล'] },
  { zh: ['通知'], vi: ['thông báo'], id: ['pemberitahuan'], th: ['แจ้ง'] },
  { zh: ['删除', '销毁', '被遗忘'], vi: ['xóa dữ liệu'], id: ['penghapusan', 'pemusnahan'], th: ['ลบ', 'ทำลาย'] },
  { zh: ['更正', '更新', '纠正'], vi: ['chỉnh sửa'], id: ['memperbarui', 'memperbaiki'], th: ['แก้ไข'] },
  { zh: ['访问', '查阅', '获取副本', '复印件'], vi: ['truy cập'], id: ['mendapatkan akses', 'salinan'], th: ['สำเนา'] },
  { zh: ['可携', '携带权', '数据可移植', '可移植'], vi: ['chuyển dữ liệu'], id: ['mengirimkan'], th: ['ขอรับข้อมูลส่วนบุคคลที่เกี่ยวกับตน'] },
  { zh: ['反对', '拒绝处理'], vi: ['phản đối'], id: ['keberatan'], th: ['คัดค้าน'] },
  { zh: ['限制处理', '暂停处理', '停止处理'], vi: ['hạn chế xử lý'], id: ['menunda atau membatasi'], th: ['ระงับการใช้'] },
  { zh: ['自动化决策', '自动处理', '画像'], vi: ['tự động'], id: ['pemrosesan secara otomatis'], th: ['อัตโนมัติ'] },
  { zh: ['赔偿', '损害赔偿', '索赔'], vi: ['bồi thường thiệt hại'], id: ['ganti rugi'], th: ['ค่าสินไหมทดแทน'] },
  { zh: ['告知', '知情', '通知义务'], vi: ['được biết'], id: ['mendapatkan informasi'], th: ['แจ้งให้เจ้าของข้อมูลส่วนบุคคลทราบ'] },
  { zh: ['目的'], vi: ['mục đích'], id: ['tujuan'], th: ['วัตถุประสงค์'] },
  { zh: ['保存期限', '存储期限', '保留期限', '保存期'], vi: ['thời gian lưu trữ'], id: ['masa retensi'], th: ['ระยะเวลา'] },
  { zh: ['安全措施', '保密', '安全保障'], vi: ['biện pháp bảo vệ'], id: ['keamanan data pribadi'], th: ['มาตรการรักษาความมั่นคงปลอดภัย'] },
  { zh: ['数据处理者', '受托处理', '处理者'], vi: ['bên xử lý dữ liệu cá nhân'], id: ['prosesor data pribadi'], th: ['ผู้ประมวลผลข้อมูลส่วนบุคคล'] },
  { zh: ['控制者'], vi: ['bên kiểm soát dữ liệu cá nhân'], id: ['pengendali data pribadi'], th: ['ผู้ควบคุมข้อมูลส่วนบุคคล'] },
  { zh: ['监管机构', '委员会', '主管机关'], vi: ['cơ quan chuyên trách bảo vệ dữ liệu cá nhân'], id: ['lembaga'], th: ['คณะกรรมการ'] },
  { zh: ['行政处罚', '行政罚款', '行政制裁'], vi: ['xử phạt vi phạm hành chính'], id: ['sanksi administratif'], th: ['โทษทางปกครอง'] },
  { zh: ['罚款', '罚金'], vi: ['phạt tiền'], id: ['denda'], th: ['ปรับไม่เกิน'] },
  { zh: ['监禁', '有期徒刑', '徒刑', '拘役'], vi: ['phạt tù'], id: ['pidana penjara'], th: ['จำคุก'] },
  { zh: ['刑事', '刑罚', '犯罪'], vi: ['hình sự'], id: ['pidana'], th: ['โทษอาญา', 'จำคุก'] },
  // --- labour ---
  { zh: ['试用期', '试用'], vi: ['thử việc'], id: ['masa percobaan'], th: ['ทดลองงาน'] },
  { zh: ['劳动合同', '雇佣合同'], vi: ['hợp đồng lao động'], id: ['perjanjian kerja'], th: ['สัญญาจ้าง'] },
  { zh: ['单方面解除', '单方解除', '解除劳动合同', '终止劳动合同', '解雇', '辞退'], vi: ['đơn phương chấm dứt hợp đồng lao động'], id: ['pemutusan hubungan kerja'], th: ['เลิกจ้าง'] },
  { zh: ['提前通知', '预告', '提前告知'], vi: ['báo trước'], id: ['pemberitahuan'], th: ['บอกกล่าวล่วงหน้า'] },
  { zh: ['遣散费', '离职补贴', '经济补偿', '补偿金', '解雇补偿'], vi: ['trợ cấp thôi việc'], id: ['uang pesangon'], th: ['ค่าชดเชย'] },
  { zh: ['失业补贴', '失业津贴'], vi: ['trợ cấp mất việc làm'], id: ['kehilangan pekerjaan'], th: ['ว่างงาน'] },
  { zh: ['加班'], vi: ['làm thêm giờ'], id: ['waktu kerja lembur'], th: ['ทำงานล่วงเวลา'] },
  { zh: ['工作时间', '工时', '正常工作时间'], vi: ['thời giờ làm việc'], id: ['waktu kerja'], th: ['เวลาทำงานปกติ'] },
  { zh: ['年假', '年休假', '带薪休假'], vi: ['nghỉ hằng năm'], id: ['cuti tahunan'], th: ['วันหยุดพักผ่อนประจำปี'] },
  { zh: ['工资', '薪资', '薪酬'], vi: ['tiền lương'], id: ['upah'], th: ['ค่าจ้าง'] },
  { zh: ['最低工资'], vi: ['mức lương tối thiểu'], id: ['upah minimum'], th: ['อัตราค่าจ้างขั้นต่ำ'] },
  { zh: ['产假', '孕妇', '怀孕', '生育'], vi: ['thai sản'], id: ['melahirkan'], th: ['มีครรภ์'] },
  { zh: ['纪律处分', '惩戒'], vi: ['kỷ luật lao động'], id: ['sanksi'], th: ['ลงโทษ'] },
  { zh: ['工会'], vi: ['công đoàn'], id: ['serikat pekerja'], th: ['สหภาพแรงงาน'] },
  { zh: ['外国劳工', '外籍员工', '外国人工作'], vi: ['người lao động nước ngoài'], id: ['tenaga kerja asing'], th: ['คนต่างด้าว'] },
  // --- investment / company ---
  { zh: ['外国投资者', '外资'], vi: ['nhà đầu tư nước ngoài'], id: ['penanam modal asing'], th: ['คนต่างด้าว'] },
  { zh: ['投资登记证', 'IRC'], vi: ['giấy chứng nhận đăng ký đầu tư'], id: ['izin usaha'], th: ['ใบอนุญาต'] },
  { zh: ['企业登记', 'ERC'], vi: ['đăng ký doanh nghiệp'], id: ['pendaftaran'], th: ['จดทะเบียน'] },
  { zh: ['禁止投资', '禁止经营'], vi: ['ngành, nghề cấm đầu tư kinh doanh'], id: ['bidang usaha yang tertutup'], th: ['ไม่อนุญาต'] },
  { zh: ['有条件投资', '附条件'], vi: ['ngành, nghề đầu tư kinh doanh có điều kiện'], id: ['persyaratan tertentu'], th: ['เงื่อนไข'] },
  { zh: ['投资政策批准', '投资主张'], vi: ['chấp thuận chủ trương đầu tư'], id: ['persetujuan'], th: ['อนุญาต'] },
  // --- e-transactions / cybersecurity ---
  { zh: ['电子签名', '数字签名'], vi: ['chữ ký điện tử'], id: ['tanda tangan elektronik'], th: ['ลายมือชื่อ'] },
  { zh: ['数据电文', '电子文件', '电子信息'], vi: ['thông điệp dữ liệu'], id: ['informasi elektronik'], th: ['ข้อมูลอิเล็กทรอนิกส์'] },
  { zh: ['电子合同'], vi: ['hợp đồng điện tử'], id: ['kontrak elektronik'], th: ['สัญญา'] },
  { zh: ['法律效力', '法律价值'], vi: ['giá trị pháp lý'], id: ['alat bukti hukum'], th: ['ผลผูกพัน'] },
  { zh: ['本地存储', '在越南境内存储', '数据本地化', '境内存储'], vi: ['lưu trữ tại việt nam'], id: ['wilayah indonesia'], th: ['ในราชอาณาจักร'] },
  { zh: ['网络安全'], vi: ['an ninh mạng'], id: ['sistem elektronik'], th: ['การรักษาความมั่นคงปลอดภัยไซเบอร์'] },
  // --- family ---
  { zh: ['结婚', '婚姻'], vi: ['kết hôn'], id: ['perkawinan'], th: ['การสมรส'] },
  { zh: ['离婚'], vi: ['ly hôn'], id: ['perceraian'], th: ['หย่า'] },
  { zh: ['登记', '注册'], vi: ['đăng ký'], id: ['dicatat'], th: ['จดทะเบียน'] },
];

const LANG_OF = { VN: 'vi', ID: 'id', TH: 'th' };

/**
 * Concepts found in a Chinese claim, rendered as official-language text for `country`.
 * Longest Chinese match wins per position; each concept is counted once.
 */
export function anchorsFor(claim, country) {
  const lang = LANG_OF[country];
  if (!lang) return { concepts: [], text: '' };
  const s = String(claim || '');
  const used = new Array(s.length).fill(false);
  const concepts = [];
  const cands = [];
  GLOSSARY.forEach((e, i) => { for (const z of e.zh) cands.push([z, i]); });
  cands.sort((a, b) => b[0].length - a[0].length);
  const seen = new Set();
  for (const [z, i] of cands) {
    let at = s.indexOf(z);
    while (at !== -1) {
      let free = true;
      for (let k = at; k < at + z.length; k++) if (used[k]) { free = false; break; }
      if (free) {
        for (let k = at; k < at + z.length; k++) used[k] = true;
        if (!seen.has(i)) { seen.add(i); concepts.push(i); }
      }
      at = s.indexOf(z, at + z.length);
    }
  }
  const text = concepts.map((i) => GLOSSARY[i][lang].join(' ; ')).join(' ; ');
  return { concepts, text };
}
