// lib/music-catalog.mjs
// Góc Hợp Âm Music Catalog - Multi-source, NFC/NFD normalized, rights-aware catalog.
import { normalizeMusicText, catalogWorkKey, rankMusicCatalog, groupCatalogByWork, sheetState } from './catalog-identity.mjs';

export const INITIAL_CATALOG = [
  {
    id: 'nang-tho',
    title: 'Nàng Thơ',
    composer: 'Hoàng Dũng',
    artist: 'Hoàng Dũng',
    key: 'C',
    genre: '3', // Nhạc Trẻ
    videoId: 'Zzn9-ATB9aU',
    sourceUrl: 'site:nang-tho',
    sheets: {
      melody: { status: 'verified', source: 'owned', confidence: 0.98 },
      piano: { status: 'verified', source: 'owned', confidence: 0.95 },
      organ: { status: 'unknown' }
    },
    rights: 'owned',
    content: `[C]Em, ngày em đánh rơi nụ cười vào anh
Có [Am]nghe mùa thu vừa ghé qua bậc thềm
[F]Mắt em như hồ thu biếc xanh [G]ngắt trời xanh
Có bao [Em]nhiêu điều chưa kịp nói [Am]ra thành câu.

[F]Ta còn yêu nhau như ngày [G]đầu tiên
[Em]Dẫu thời gian cuốn trôi muộn [Am]phiền
[F]Nàng thơ của anh hỡi [G]em
Có nghe tim [C]anh đang gọi tên.`
  },
  {
    id: 'diem-xua',
    title: 'Diễm Xưa',
    composer: 'Trịnh Công Sơn',
    artist: 'Khánh Ly',
    key: 'Am',
    genre: '2', // Nhạc Trữ tình
    videoId: 'M7lc1UVf-VE',
    sourceUrl: 'site:diem-xua',
    sheets: {
      melody: { status: 'verified', source: 'public_domain', confidence: 0.99 },
      piano: { status: 'verified', source: 'owned', confidence: 0.92 },
      organ: { status: 'unknown' }
    },
    rights: 'public_domain',
    content: `[Am]Mưa vẫn mưa bay trên tầng tháp [Dm]cổ
Dài tay em [E7]mấy thuở mắt xanh [Am]xao
Nghe lá thu [Dm]mưa reo mòn gót [Am]nhỏ
Đường dài hun [F]hút cho mắt thêm [E7]sâu.

[Am]Mưa vẫn hay mưa trên hàng lá [Dm]nhỏ
Buổi chiều ngồi [E7]ngóng những chuyến mưa [Am]qua
Trên bước chân [Dm]em âm thầm lá [Am]đổ
Chợt hồn xanh [E7]buốt cho mình xót [Am]xa.`
  },
  {
    id: 'ha-trang',
    title: 'Hạ Trắng',
    composer: 'Trịnh Công Sơn',
    artist: 'Trịnh Công Sơn',
    key: 'C',
    genre: '2',
    videoId: 'b5sX9R3iWz8',
    sourceUrl: 'site:ha-trang',
    sheets: {
      melody: { status: 'verified', source: 'public_domain', confidence: 0.97 },
      piano: { status: 'ai_draft', source: 'ai', confidence: 0.88 },
      organ: { status: 'unknown' }
    },
    rights: 'public_domain',
    content: `[C]Gọi nắng trên vai em gầy đường xa áo [Am]bay
[F]Nắng qua mắt buồn lòng hoa bướm [G]say
[C]Lối em đi về trời không có [Am]mây
[Dm]Đường đi suốt [G]mùa hạ trắng [C]này.`
  },
  {
    id: 'buoc-qua-nhau',
    title: 'Bước Qua Nhau',
    composer: 'Vũ',
    artist: 'Vũ',
    key: 'G',
    genre: '3',
    videoId: 'x3kd_Qc_d7Q',
    sourceUrl: 'site:buoc-qua-nhau',
    sheets: {
      melody: { status: 'verified', source: 'owned', confidence: 0.96 },
      piano: { status: 'ai_draft', source: 'ai', confidence: 0.85 },
      organ: { status: 'unknown' }
    },
    rights: 'owned',
    content: `[G]Cuộc đời cứ trôi, ta [D/F#]ngỡ như vừa mới hôm qua
[Em]Chỉ là phút giây nhìn [Bm]nhau rồi bước vội vã
[C]Có những nỗi nhớ chẳng [G/B]thể đặt tên
[Am7]Còn vương vấn trên từng [D7]ngón tay mềm.

[G]Và rồi ta bước qua [D/F#]nhau như chưa từng quen
[Em]Để lại bao giấc mơ [Bm]ngủ quên trong đêm
[C]Dù mai sau có [G/B]gặp lại chốn xưa
[Am7]Thì nụ cười ấy cũng [D7]chẳng còn như [G]xưa.`
  },
  {
    id: 'la-lung',
    title: 'Lạ Lùng',
    composer: 'Vũ',
    artist: 'Vũ',
    key: 'C',
    genre: '3',
    videoId: 'F5tS54642q4',
    sourceUrl: 'site:la-lung',
    sheets: {
      melody: { status: 'ai_draft', source: 'ai', confidence: 0.89 },
      piano: { status: 'unknown' },
      organ: { status: 'unknown' }
    },
    rights: 'unknown',
    content: `[C]Kìa màn đêm hiu hắt mang [G/B]theo làn gió
[Am]Về đâu khi ánh đèn [Em]buông lơi phố nhỏ
[F]Bao nhiêu năm ta [C/E]vẫn cứ ngóng chờ
[Dm]Một hình bóng xa [G]xôi.

[C]Lạ lùng em tới trao [G/B]anh nụ cười
[Am]Để rồi đêm buông lại [Em]ngỡ giấc mơ thôi
[F]Cứ thế trôi đi [C/E]theo từng năm tháng
[Dm]Biết bao giờ [G]ta lại thấy [C]nhau.`
  },
  {
    id: 'di-ve-nha',
    title: 'Đi Về Nhà',
    composer: 'Hứa Kim Tuyền',
    artist: 'Đen Vâu, JustaTee',
    key: 'F',
    genre: '3',
    videoId: 'vIJm1s8fF-g',
    sourceUrl: 'site:di-ve-nha',
    sheets: {
      melody: { status: 'ai_draft', source: 'ai', confidence: 0.84 },
      piano: { status: 'unknown' },
      organ: { status: 'unknown' }
    },
    rights: 'unknown',
    content: `[F]Đường về nhà là vào tim ta [Am]dẫu nắng khoác vai hay mưa trên đầu
[Bb]Dù gập ghềnh ngàn dặm xa xôi [C]vẫn thấy ấm êm nơi căn bếp hồng.
[F]Hạnh phúc đi về nhà, [Am]cô đơn đi về nhà
[Bb]Thành công đi về nhà, [C]thất bại đi về nhà.`
  },
  {
    id: 'tien-quan-ca',
    title: 'Tiến Quân Ca',
    composer: 'Văn Cao',
    artist: 'Hợp xướng',
    key: 'C',
    genre: '6', // Nhạc Đỏ
    videoId: '0mH3G6kC8_k',
    sourceUrl: 'site:tien-quan-ca',
    sheets: {
      melody: { status: 'verified', source: 'public_domain', confidence: 1.0 },
      piano: { status: 'verified', source: 'public_domain', confidence: 0.96 },
      organ: { status: 'verified', source: 'public_domain', confidence: 0.94 }
    },
    rights: 'public_domain',
    content: `[C]Đoàn quân Việt Nam đi, chung lòng cứu [G]quốc
Bước chân dồn [C]vang trên đường gập [G]ghềnh xa
[C]Cờ in máu chiến thắng mang hồn [F]nước
Súng ngoài [G]xa chen khúc quân hành [C]ca.

[F]Đường vinh quang xây xác quân [C]thù
[Dm]Thắng gian lao cùng [G]nhau lập chiến [C]khu.
Vì nhân [F]dân chiến đấu không [C]ngừng
Tiến mau [G]ra sa trường, tiến [C]lên!`
  },
  {
    id: 'thuyen-va-bien',
    title: 'Thuyền Và Biển',
    composer: 'Phan Huỳnh Điểu',
    artist: 'Xuân Hảo',
    key: 'Dm',
    genre: '2',
    videoId: 'dQw4w9WgXcQ',
    sourceUrl: 'site:thuyen-va-bien',
    sheets: {
      melody: { status: 'verified', source: 'owned', confidence: 0.94 },
      piano: { status: 'unknown' },
      organ: { status: 'unknown' }
    },
    rights: 'owned',
    content: `[Dm]Chỉ có thuyền mới hiểu [Gm]biển mênh mông nhường [Dm]nào
Chỉ có biển mới [A7]biết thuyền đi đâu về [Dm]đâu.
[Gm]Những ngày nào không gặp [Dm]biển tái ngắt một màu [Gm]mây
Những ngày nào không [A7]gặp thuyền sóng gió biển bạc [Dm]đầu.`
  },
  {
    id: 've-que-ngoai',
    title: 'Về Quê Ngoại',
    composer: 'Nguyễn Ngọc Thạch',
    artist: 'Quang Lê',
    key: 'C',
    genre: '4', // Nhạc Quê hương
    videoId: 'qT3V8k4Y2x0',
    sourceUrl: 'site:ve-que-ngoai',
    sheets: {
      melody: { status: 'missing' },
      piano: { status: 'unknown' },
      organ: { status: 'unknown' }
    },
    rights: 'unknown',
    content: `[C]Anh đón em về thăm quê ngoại bến [Am]xưa
Cầu tre lắc [F]lẻo nghe câu hò ngày [G]mưa.
[C]Bao năm xa cách nay trở [Am]về
Thương khói lam [Dm]chiều vương mái tranh [G]quê.`
  },
  {
    id: 'em-ve-tinh-khoi',
    title: 'Em Về Tinh Khôi',
    composer: 'Quốc Bảo',
    artist: 'Hà Anh Tuấn',
    key: 'G',
    genre: '3',
    videoId: 'A1B2C3D4E5F',
    sourceUrl: 'site:em-ve-tinh-khoi',
    sheets: {
      melody: { status: 'ai_draft', source: 'ai', confidence: 0.87 },
      piano: { status: 'unknown' },
      organ: { status: 'unknown' }
    },
    rights: 'unknown',
    content: `[G]Bờ vai ngoan em ngủ say [Em]trong vòng tay
[C]Nụ cười hiền thắp sáng sớm [D]mai ngây ngất.
[G]Em về tinh khôi như giọt sương [Em]mai
[C]Cho anh ngơ ngẩn [D]suốt cả cuộc [G]đời.`
  },
  {
    id: 'mot-tinh-yeu-nho',
    title: 'Một Tình Yêu Nhỏ',
    composer: 'NPT Duy',
    artist: 'Góc Hợp Âm Band',
    key: 'C',
    genre: '1',
    videoId: 'k5s8M9xY1z2',
    sourceUrl: 'site:mot-tinh-yeu-nho',
    sheets: {
      melody: { status: 'verified', source: 'owned', confidence: 1.0 },
      piano: { status: 'verified', source: 'owned', confidence: 0.98 },
      organ: { status: 'verified', source: 'owned', confidence: 0.95 }
    },
    rights: 'owned',
    content: `[C]Một buổi sáng nghe tiếng đàn [Am]ngân vang
[F]Khẽ chạm phím buông muộn phiền [G]gian nan.
[C]Góc hợp âm nơi gặp gỡ [Am]tri âm
[Dm]Cho khúc tình [G]ca thắm mãi trong [C]lòng.`
  },
  {
    id: 'de-nho-mot-thoi-ta-da-yeu',
    title: 'Để Nhớ Một Thời Ta Đã Yêu',
    composer: 'Thái Thịnh',
    artist: 'Bằng Kiều',
    key: 'Am',
    genre: '2',
    videoId: 'xY8zW2k1j0A',
    sourceUrl: 'site:de-nho-mot-thoi-ta-da-yeu',
    sheets: {
      melody: { status: 'ai_draft', source: 'ai', confidence: 0.86 },
      piano: { status: 'unknown' },
      organ: { status: 'unknown' }
    },
    rights: 'unknown',
    content: `[Am]Hạnh phúc trong tầm với đã không còn [Dm]nữa
Khi em buông [G]lời chia tay lạnh [C]lùng.
[F]Còn lại gì sau những tháng [Dm]ngày yêu dấu
Chỉ là [E7]nỗi đau gặm nhấm tim [Am]anh.`
  }
];

export class MusicCatalogService {
  constructor(initialData = INITIAL_CATALOG) {
    this.songs = [...initialData];
    this.songsById = new Map();
    this.refreshIndices();
  }

  refreshIndices() {
    this.songsById.clear();
    for (const song of this.songs) {
      if (song.id) this.songsById.set(song.id, song);
      if (song.sourceUrl) this.songsById.set(song.sourceUrl, song);
    }
  }

  addSong(record) {
    if (!record || !record.title) return null;
    const id = record.id || 'song-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const item = {
      ...record,
      id,
      sourceUrl: record.sourceUrl || `site:${id}`,
      sheets: record.sheets || { melody: { status: 'missing' }, piano: { status: 'unknown' }, organ: { status: 'unknown' } },
      rights: record.rights || 'unknown'
    };
    this.songs.push(item);
    this.songsById.set(item.id, item);
    this.songsById.set(item.sourceUrl, item);
    return item;
  }

  getSong(idOrUrl) {
    if (!idOrUrl) return null;
    const clean = String(idOrUrl).trim();
    if (this.songsById.has(clean)) return this.songsById.get(clean);
    if (clean.startsWith('site:') && this.songsById.has(clean.slice(5))) {
      return this.songsById.get(clean.slice(5));
    }
    // Search by title or partial url
    for (const s of this.songs) {
      if (s.sourceUrl === clean || s.id === clean) return s;
    }
    return null;
  }

  search({ query = '', genre = '', type = 'title', mode = 'hot', page = 0, limit = 20 }) {
    let pool = [...this.songs];

    // Filter by genre if specified
    if (genre) {
      pool = pool.filter(s => String(s.genre) === String(genre));
    }

    const q = normalizeMusicText(query);
    let results = [];

    if (!q) {
      // Sorting by mode
      if (mode === 'latest') {
        results = [...pool].reverse();
      } else {
        // 'hot' / curated
        results = [...pool];
      }
    } else {
      // Use ranking from catalog-identity.mjs
      if (type === 'singer') {
        // filter by artist first
        pool.sort((a, b) => {
          const aArtist = normalizeMusicText(a.artist || '');
          const bArtist = normalizeMusicText(b.artist || '');
          const aMatch = aArtist.includes(q) ? 1 : 0;
          const bMatch = bArtist.includes(q) ? 1 : 0;
          return bMatch - aMatch;
        });
      } else if (type === 'composer') {
        pool.sort((a, b) => {
          const aComp = normalizeMusicText(a.composer || '');
          const bComp = normalizeMusicText(b.composer || '');
          const aMatch = aComp.includes(q) ? 1 : 0;
          const bMatch = bComp.includes(q) ? 1 : 0;
          return bMatch - aMatch;
        });
      }

      const ranked = rankMusicCatalog(pool, q, { limit: 200 });
      results = ranked.map(r => r.song);
    }

    const start = Math.max(0, Number(page) || 0) * limit;
    const paged = results.slice(start, start + limit);
    const hasMore = start + limit < results.length;

    return {
      items: paged.map(s => ({
        id: s.id,
        title: s.title,
        author: s.composer || s.artist || 'Góc Hợp Âm',
        composer: s.composer,
        artist: s.artist,
        key: s.key || 'C',
        genre: s.genre,
        sourceUrl: s.sourceUrl,
        url: s.sourceUrl,
        videoId: s.videoId,
        sheets: s.sheets,
        rights: s.rights
      })),
      page: Number(page) || 0,
      total: results.length,
      hasMore
    };
  }
}

export const musicCatalog = new MusicCatalogService();
