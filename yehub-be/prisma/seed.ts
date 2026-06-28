import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CATEGORY_NAMES = [
  'FMCG',
  'Tech',
  'Automotive',
  'F&B',
  'E-commerce',
  'Telecom',
  'Finance',
  'Healthcare',
  'Entertainment',
  'Fashion',
];

// ─── KOL Categories & Tiers ────────────────────────────────────────

const KOL_CATEGORIES = [
  { name: 'Beauty', description: 'Skincare, makeup, and cosmetics content creators', color: 'pink' },
  { name: 'Tech', description: 'Technology reviews, gadgets, and software', color: 'blue' },
  { name: 'Food', description: 'Food reviews, cooking, and restaurant content', color: 'orange' },
  { name: 'Fashion', description: 'Style, clothing, and accessories influencers', color: 'purple' },
  { name: 'Travel', description: 'Travel vlogs, destinations, and tourism content', color: 'teal' },
  { name: 'Fitness', description: 'Workout routines, health tips, and wellness', color: 'green' },
  { name: 'Entertainment', description: 'Comedy, music, acting, and celebrity content', color: 'amber' },
  { name: 'Education', description: 'Learning, tutorials, and educational content', color: 'indigo' },
  { name: 'Gaming', description: 'Game reviews, streaming, and esports', color: 'red' },
  { name: 'Lifestyle', description: 'Daily life, home decor, and family content', color: 'gray' },
];

const KOL_TIERS = [
  { name: 'Mega', description: '1M+ followers — Top-tier celebrities and influencers', color: 'amber', min_followers: 1000000, max_followers: null },
  { name: 'Macro', description: '100K-1M followers — Established influencers', color: 'purple', min_followers: 100000, max_followers: 999999 },
  { name: 'Mid-tier', description: '50K-100K followers — Growing influencers', color: 'blue', min_followers: 50000, max_followers: 99999 },
  { name: 'Micro', description: '10K-50K followers — Niche content creators', color: 'green', min_followers: 10000, max_followers: 49999 },
  { name: 'Nano', description: '1K-10K followers — Everyday advocates', color: 'gray', min_followers: 1000, max_followers: 9999 },
];

type Gender = 'MALE' | 'FEMALE';

interface ProfileSeed {
  name: string;
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  tier: string;
  categories: string[];
}

const PROFILES: ProfileSeed[] = [
  { name: 'Ninh Duong Lan Ngoc', gender: 'FEMALE', email: 'lanngoc@example.com', phone: '0901000001', tags: ['celebrity', 'actress'], tier: 'Mega', categories: ['Beauty', 'Fashion', 'Entertainment'] },
  { name: 'Tran Thanh', gender: 'MALE', email: 'tranthanh@example.com', phone: '0901000002', tags: ['celebrity', 'comedian', 'MC'], tier: 'Mega', categories: ['Entertainment'] },
  { name: 'Son Tung MTP', gender: 'MALE', email: 'sontung@example.com', phone: '0901000003', tags: ['celebrity', 'singer'], tier: 'Mega', categories: ['Entertainment', 'Fashion', 'Lifestyle'] },
  { name: 'Khoa Pug', gender: 'MALE', email: 'khoapug@example.com', phone: '0901000004', tags: ['youtuber', 'vlogger'], tier: 'Mega', categories: ['Travel', 'Food', 'Entertainment', 'Lifestyle'] },
  { name: 'Chau Bui', gender: 'FEMALE', email: 'chaubui@example.com', phone: '0901000005', tags: ['model', 'fashionista'], tier: 'Mega', categories: ['Fashion', 'Beauty', 'Lifestyle'] },
  { name: 'Quynh Anh Shyn', gender: 'FEMALE', email: 'quynhanhshyn@example.com', phone: '0901000006', tags: ['model', 'fashionista'], tier: 'Mega', categories: ['Fashion', 'Beauty'] },
  { name: 'Khanh Vy', gender: 'FEMALE', email: 'khanhvy@example.com', phone: '0901000007', tags: ['MC', 'education'], tier: 'Mega', categories: ['Travel', 'Education', 'Lifestyle'] },
  { name: 'Ha Thu Reviewer', gender: 'FEMALE', email: 'hathu@example.com', phone: '0901000008', tags: ['reviewer', 'beauty'], tier: 'Macro', categories: ['Beauty', 'Lifestyle'] },
  { name: 'Changmakeup', gender: 'FEMALE', email: 'changmakeup@example.com', phone: '0901000009', tags: ['beauty', 'makeup'], tier: 'Macro', categories: ['Beauty'] },
  { name: 'Giang Oi', gender: 'FEMALE', email: 'giangoi@example.com', phone: '0901000010', tags: ['youtuber', 'lifestyle'], tier: 'Macro', categories: ['Travel', 'Lifestyle'] },
  { name: 'Chloe Nguyen', gender: 'FEMALE', email: 'chloenguyen@example.com', phone: '0901000011', tags: ['fashion', 'beauty'], tier: 'Macro', categories: ['Fashion', 'Beauty', 'Travel'] },
  { name: 'Khoai Lang Thang', gender: 'MALE', email: 'khoailangthang@example.com', phone: '0901000012', tags: ['youtuber', 'travel'], tier: 'Macro', categories: ['Travel', 'Food'] },
  { name: 'Trinh Pham', gender: 'FEMALE', email: 'trinhpham@example.com', phone: '0901000013', tags: ['beauty', 'skincare'], tier: 'Macro', categories: ['Beauty', 'Lifestyle'] },
  { name: 'Helly Tong', gender: 'FEMALE', email: 'hellytong@example.com', phone: '0901000014', tags: ['fashion', 'travel'], tier: 'Macro', categories: ['Fashion', 'Travel'] },
  { name: 'Dua Leo', gender: 'MALE', email: 'dualeo@example.com', phone: '0901000015', tags: ['comedian', 'vlogger'], tier: 'Macro', categories: ['Travel', 'Entertainment'] },
  { name: 'Vinamilk Official', gender: null, email: 'marketing@vinamilk.com', phone: '02838155555', tags: ['brand', 'FMCG'], tier: 'Mega', categories: ['Food'] },
  { name: 'Grab Vietnam Official', gender: null, email: 'marketing@grab.vn', phone: '19001502', tags: ['brand', 'tech'], tier: 'Mega', categories: ['Tech', 'Food'] },
  { name: 'Tech Daily VN', gender: null, email: 'contact@techdaily.vn', phone: null, tags: ['media', 'tech'], tier: 'Macro', categories: ['Tech', 'Education'] },
  { name: 'VinFast Official', gender: null, email: 'marketing@vinfast.vn', phone: '18009010', tags: ['brand', 'automotive'], tier: 'Mega', categories: ['Tech'] },
  { name: 'Foodie Saigon', gender: null, email: 'contact@foodiesaigon.vn', phone: null, tags: ['media', 'food'], tier: 'Macro', categories: ['Food', 'Lifestyle'] },
];

type PlatformType = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE';

interface SocialAccountSeed {
  platform: PlatformType;
  username: string;
  display_name: string;
  follower_count: number;
}

function getSocialAccounts(profileName: string, tier: string): SocialAccountSeed[] {
  const isMega = tier === 'Mega';
  const baseFollowers = isMega ? 1500000 : 250000;
  const slug = profileName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

  const accounts: Record<string, SocialAccountSeed[]> = {
    'Ninh Duong Lan Ngoc': [
      { platform: 'FACEBOOK', username: 'ninhduonglanngoc', display_name: 'Ninh Dương Lan Ngọc', follower_count: 12000000 },
      { platform: 'INSTAGRAM', username: 'lanngoc_official', display_name: 'Lan Ngọc', follower_count: 5000000 },
      { platform: 'TIKTOK', username: 'lanngoc_official', display_name: 'Ninh Dương Lan Ngọc', follower_count: 8000000 },
      { platform: 'YOUTUBE', username: 'NinhDuongLanNgoc', display_name: 'Ninh Dương Lan Ngọc', follower_count: 3000000 },
    ],
    'Tran Thanh': [
      { platform: 'FACEBOOK', username: 'tranthanh.official', display_name: 'Trấn Thành', follower_count: 15000000 },
      { platform: 'INSTAGRAM', username: 'tranthanh', display_name: 'Trấn Thành', follower_count: 4000000 },
      { platform: 'YOUTUBE', username: 'TranThanhTown', display_name: 'Trấn Thành Town', follower_count: 10000000 },
    ],
    'Son Tung MTP': [
      { platform: 'FACEBOOK', username: 'sontungmtp', display_name: 'Sơn Tùng M-TP', follower_count: 13000000 },
      { platform: 'INSTAGRAM', username: 'sontungmtp', display_name: 'Sơn Tùng M-TP', follower_count: 6000000 },
      { platform: 'YOUTUBE', username: 'SonTungMTP', display_name: 'Sơn Tùng M-TP Official', follower_count: 12000000 },
      { platform: 'TIKTOK', username: 'sontungmtp', display_name: 'Sơn Tùng M-TP', follower_count: 9000000 },
    ],
    'Khoa Pug': [
      { platform: 'YOUTUBE', username: 'KhoaPug', display_name: 'Khoa Pug', follower_count: 4500000 },
      { platform: 'FACEBOOK', username: 'khoapug', display_name: 'Khoa Pug', follower_count: 2000000 },
      { platform: 'TIKTOK', username: 'khoapug', display_name: 'Khoa Pug', follower_count: 1500000 },
    ],
    'Chau Bui': [
      { platform: 'INSTAGRAM', username: 'chaubui', display_name: 'Châu Bùi', follower_count: 3500000 },
      { platform: 'FACEBOOK', username: 'chaubui.official', display_name: 'Châu Bùi', follower_count: 2000000 },
      { platform: 'TIKTOK', username: 'chaubui', display_name: 'Châu Bùi', follower_count: 2500000 },
    ],
    'Quynh Anh Shyn': [
      { platform: 'INSTAGRAM', username: 'quynhanhshyn', display_name: 'Quỳnh Anh Shyn', follower_count: 2800000 },
      { platform: 'FACEBOOK', username: 'quynhanhshyn', display_name: 'Quỳnh Anh Shyn', follower_count: 1500000 },
      { platform: 'TIKTOK', username: 'quynhanhshyn', display_name: 'Quỳnh Anh Shyn', follower_count: 1800000 },
    ],
    'Khanh Vy': [
      { platform: 'FACEBOOK', username: 'khanhvy.official', display_name: 'Khánh Vy', follower_count: 5000000 },
      { platform: 'YOUTUBE', username: 'KhanhVy', display_name: 'Khánh Vy', follower_count: 2000000 },
      { platform: 'TIKTOK', username: 'khanhvy', display_name: 'Khánh Vy', follower_count: 3000000 },
      { platform: 'INSTAGRAM', username: 'khanhvy', display_name: 'Khánh Vy', follower_count: 1500000 },
    ],
    'Ha Thu Reviewer': [
      { platform: 'YOUTUBE', username: 'HaThuReviewer', display_name: 'Hà Thu Reviewer', follower_count: 500000 },
      { platform: 'TIKTOK', username: 'hathureviewer', display_name: 'Hà Thu Reviewer', follower_count: 350000 },
      { platform: 'INSTAGRAM', username: 'hathureviewer', display_name: 'Hà Thu Reviewer', follower_count: 200000 },
    ],
    'Changmakeup': [
      { platform: 'YOUTUBE', username: 'Changmakeup', display_name: 'Changmakeup', follower_count: 800000 },
      { platform: 'INSTAGRAM', username: 'changmakeup', display_name: 'Changmakeup', follower_count: 600000 },
      { platform: 'FACEBOOK', username: 'changmakeup', display_name: 'Changmakeup', follower_count: 400000 },
    ],
    'Giang Oi': [
      { platform: 'YOUTUBE', username: 'GiangOi', display_name: 'Giang Ơi', follower_count: 900000 },
      { platform: 'FACEBOOK', username: 'giangoi', display_name: 'Giang Ơi', follower_count: 500000 },
      { platform: 'INSTAGRAM', username: 'giangoi', display_name: 'Giang Ơi', follower_count: 300000 },
    ],
    'Chloe Nguyen': [
      { platform: 'YOUTUBE', username: 'ChloeNguyen', display_name: 'Chloe Nguyen', follower_count: 700000 },
      { platform: 'INSTAGRAM', username: 'chloenguyen', display_name: 'Chloe Nguyen', follower_count: 500000 },
      { platform: 'TIKTOK', username: 'chloenguyen', display_name: 'Chloe Nguyen', follower_count: 300000 },
    ],
    'Khoai Lang Thang': [
      { platform: 'YOUTUBE', username: 'KhoaiLangThang', display_name: 'Khoai Lang Thang', follower_count: 3000000 },
      { platform: 'FACEBOOK', username: 'khoailangthang', display_name: 'Khoai Lang Thang', follower_count: 800000 },
      { platform: 'TIKTOK', username: 'khoailangthang', display_name: 'Khoai Lang Thang', follower_count: 500000 },
    ],
    'Trinh Pham': [
      { platform: 'YOUTUBE', username: 'TrinhPham', display_name: 'Trinh Pham', follower_count: 400000 },
      { platform: 'INSTAGRAM', username: 'trinhpham', display_name: 'Trinh Pham', follower_count: 300000 },
    ],
    'Helly Tong': [
      { platform: 'INSTAGRAM', username: 'hellytong', display_name: 'Helly Tống', follower_count: 500000 },
      { platform: 'FACEBOOK', username: 'hellytong', display_name: 'Helly Tống', follower_count: 300000 },
      { platform: 'TIKTOK', username: 'hellytong', display_name: 'Helly Tống', follower_count: 200000 },
    ],
    'Dua Leo': [
      { platform: 'YOUTUBE', username: 'DuaLeo', display_name: 'Dưa Leo', follower_count: 600000 },
      { platform: 'FACEBOOK', username: 'dualeo', display_name: 'Dưa Leo', follower_count: 400000 },
      { platform: 'TIKTOK', username: 'dualeo', display_name: 'Dưa Leo', follower_count: 350000 },
    ],
    'Vinamilk Official': [
      { platform: 'FACEBOOK', username: 'vinamilk', display_name: 'Vinamilk', follower_count: 5000000 },
      { platform: 'YOUTUBE', username: 'Vinamilk', display_name: 'Vinamilk Official', follower_count: 500000 },
      { platform: 'INSTAGRAM', username: 'vinamilk', display_name: 'Vinamilk', follower_count: 200000 },
      { platform: 'TIKTOK', username: 'vinamilk', display_name: 'Vinamilk', follower_count: 1000000 },
    ],
    'Grab Vietnam Official': [
      { platform: 'FACEBOOK', username: 'grabvn', display_name: 'Grab Vietnam', follower_count: 3000000 },
      { platform: 'INSTAGRAM', username: 'grabvn', display_name: 'Grab Vietnam', follower_count: 500000 },
      { platform: 'TIKTOK', username: 'grabvn', display_name: 'Grab Vietnam', follower_count: 2000000 },
    ],
    'Tech Daily VN': [
      { platform: 'YOUTUBE', username: 'TechDailyVN', display_name: 'Tech Daily VN', follower_count: 300000 },
      { platform: 'FACEBOOK', username: 'techdailyvn', display_name: 'Tech Daily VN', follower_count: 200000 },
    ],
    'VinFast Official': [
      { platform: 'FACEBOOK', username: 'vinfast', display_name: 'VinFast', follower_count: 4000000 },
      { platform: 'YOUTUBE', username: 'VinFast', display_name: 'VinFast Official', follower_count: 800000 },
      { platform: 'INSTAGRAM', username: 'vinfast', display_name: 'VinFast', follower_count: 300000 },
      { platform: 'TIKTOK', username: 'vinfast', display_name: 'VinFast', follower_count: 1500000 },
    ],
    'Foodie Saigon': [
      { platform: 'FACEBOOK', username: 'foodiesaigon', display_name: 'Foodie Saigon', follower_count: 400000 },
      { platform: 'INSTAGRAM', username: 'foodiesaigon', display_name: 'Foodie Saigon', follower_count: 250000 },
      { platform: 'TIKTOK', username: 'foodiesaigon', display_name: 'Foodie Saigon', follower_count: 300000 },
    ],
  };

  return accounts[profileName] || [
    { platform: 'FACEBOOK' as PlatformType, username: slug, display_name: profileName, follower_count: baseFollowers },
    { platform: 'INSTAGRAM' as PlatformType, username: slug, display_name: profileName, follower_count: Math.floor(baseFollowers * 0.7) },
  ];
}

// ─── Comment templates ──────────────────────────────────────────────

const vietnameseCommentTemplates = {
  positive: [
    'Quá tuyệt vời luôn! Sản phẩm chất lượng quá',
    'Mình đã dùng rồi, thực sự rất hài lòng',
    'Ủng hộ mãi! Sản phẩm Việt Nam chất lượng cao',
    'Xuất sắc! Đúng là đồng tiền đi liền khúc xương',
    'Quá xịn sò! Mua hoài không chán luôn',
    'Cảm ơn đã chia sẻ, sản phẩm thật sự tốt',
    'Đã mua thử và rất thích! Sẽ giới thiệu cho bạn bè',
    'Giá cả hợp lý mà chất lượng tuyệt vời',
    'Dùng được 1 tháng rồi, rất hài lòng nha mọi người',
    'Best sản phẩm trong tầm giá! Recommend cho mọi người',
    'Chất lượng vượt mong đợi luôn, 10 điểm!',
    'Đóng gói đẹp, giao hàng nhanh, sản phẩm ok',
    'Mua lần 2 rồi nè, quá ưng luôn',
    'Sản phẩm này xứng đáng 5 sao!',
    'Wow, không ngờ chất lượng tốt đến vậy',
  ],
  neutral: [
    'Sản phẩm cũng bình thường thôi, không có gì đặc biệt',
    'Mình thấy cũng ok, nhưng chưa quá ấn tượng',
    'Giá hơi cao so với chất lượng nhận được',
    'Cho mình hỏi sản phẩm này còn hàng không?',
    'Có ai dùng thử chưa? Cho mình xin review với',
    'Bao giờ có đợt sale tiếp theo vậy?',
    'Tạm được, đang cân nhắc mua thêm',
    'Mình đang so sánh với sản phẩm khác',
    'Giao hàng hơi lâu nhưng sản phẩm ok',
    'Cũng được, nhưng mình nghĩ có thể cải thiện thêm',
  ],
  negative: [
    'Sản phẩm không như quảng cáo, rất thất vọng',
    'Mình mua về dùng thử mà không thấy hiệu quả gì',
    'Giá quá đắt mà chất lượng không tương xứng',
    'Dịch vụ khách hàng tệ quá, gọi mãi không được',
    'Giao hàng chậm, đóng gói cẩu thả',
    'Sản phẩm bị lỗi mà không đổi được, buồn quá',
    'Quảng cáo một đằng, thực tế một nẻo',
    'Mình sẽ không mua lại nữa đâu',
  ],
};

type SentimentKey = keyof typeof vietnameseCommentTemplates;
const sentiments: SentimentKey[] = ['positive', 'neutral', 'negative'];
const sentimentMap: Record<SentimentKey, 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'> =
  {
    positive: 'POSITIVE',
    neutral: 'NEUTRAL',
    negative: 'NEGATIVE',
  };
const emotions = [
  'JOY',
  'ANGER',
  'SADNESS',
  'FEAR',
  'SURPRISE',
  'DISGUST',
] as const;

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Post seed data (modeled after yehub-demo fixtures) ─────────────

interface PostSeed {
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'THREADS';
  platform_post_id: string;
  url: string;
  content: string;
  author_name: string;
  author_avatar: string;
  media_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  published_at: string;
  likes: number;
  shares: number;
  views: number;
  comment_count: number;
  kpi_targets: {
    engagement: number;
    buzz: number;
    interaction: number;
    view: number;
  };
}

// Campaign 1: Organic Milk TVC
const campaign1Posts: PostSeed[] = [
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_organic_milk_tvc_001',
    url: 'https://www.facebook.com/groups/861108920047086/permalink/922189230605721/',
    content:
      'Sữa organic Vinamilk - nguồn dinh dưỡng tự nhiên cho cả gia đình 🥛 #Vinamilk #Organic',
    author_name: 'Vinamilk Official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VM',
    media_type: 'VIDEO',
    published_at: '2026-01-16T08:00:00Z',
    likes: 12500,
    shares: 320,
    views: 185000,
    comment_count: 890,
    kpi_targets: { engagement: 1600, buzz: 960, interaction: 1280, view: 4000 },
  },
  {
    platform: 'INSTAGRAM',
    platform_post_id: 'ig_organic_milk_001',
    url: 'https://www.instagram.com/reel/DWKBC0WOpD1',
    content:
      'Mỗi giọt sữa organic đều là cam kết với thiên nhiên. #VinamilkOrganic',
    author_name: 'vinamilk_official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VM',
    media_type: 'IMAGE',
    published_at: '2026-01-18T10:00:00Z',
    likes: 8900,
    shares: 180,
    views: 95000,
    comment_count: 456,
    kpi_targets: { engagement: 700, buzz: 420, interaction: 560, view: 1750 },
  },
  {
    platform: 'YOUTUBE',
    platform_post_id: 'yt_organic_milk_tvc_001',
    url: 'https://www.youtube.com/watch?v=K01LvulhFRg',
    content: 'TVC Sữa Organic Vinamilk - Vì sức khỏe gia đình Việt',
    author_name: 'Vinamilk Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VM',
    media_type: 'VIDEO',
    published_at: '2026-01-20T12:00:00Z',
    likes: 5600,
    shares: 890,
    views: 450000,
    comment_count: 340,
    kpi_targets: { engagement: 500, buzz: 300, interaction: 400, view: 1250 },
  },
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_organic_farm_001',
    url: 'https://www.facebook.com/reel/1312599174101620',
    content:
      'Thăm trang trại organic Vinamilk - Nơi sản xuất nguồn sữa tự nhiên nhất',
    author_name: 'Vinamilk Official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VM',
    media_type: 'CAROUSEL',
    published_at: '2026-01-25T08:00:00Z',
    likes: 7800,
    shares: 450,
    views: 165000,
    comment_count: 520,
    kpi_targets: { engagement: 1000, buzz: 600, interaction: 800, view: 2500 },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_organic_challenge_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content:
      'Thử thách uống sữa organic! Tham gia cùng Vinamilk nào #OrganicChallenge',
    author_name: 'vinamilk_official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VM',
    media_type: 'VIDEO',
    published_at: '2026-02-01T16:00:00Z',
    likes: 38000,
    shares: 6800,
    views: 950000,
    comment_count: 2400,
    kpi_targets: {
      engagement: 4000,
      buzz: 2400,
      interaction: 3200,
      view: 10000,
    },
  },
];

// Campaign 2: KOL Collaboration Q1
const campaign2Posts: PostSeed[] = [
  {
    platform: 'INSTAGRAM',
    platform_post_id: 'ig_kol_review_001',
    url: 'https://www.instagram.com/p/DWwWtWSklXh/',
    content:
      'Review sữa organic Vinamilk cùng mình nhé! Sữa ngon lắm mọi người ơi 😍',
    author_name: 'thuy_tien_official',
    author_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TT',
    media_type: 'CAROUSEL',
    published_at: '2026-01-22T09:00:00Z',
    likes: 15200,
    shares: 450,
    views: 280000,
    comment_count: 1200,
    kpi_targets: { engagement: 1600, buzz: 960, interaction: 1280, view: 4000 },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_kol_organic_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content: 'Thử thách uống sữa organic 30 ngày! Kết quả bất ngờ...',
    author_name: 'ninh_duong',
    author_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ND',
    media_type: 'VIDEO',
    published_at: '2026-01-25T15:00:00Z',
    likes: 42000,
    shares: 5600,
    views: 890000,
    comment_count: 2800,
    kpi_targets: {
      engagement: 5000,
      buzz: 3000,
      interaction: 4000,
      view: 12500,
    },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_kol3_review_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content: 'Review nhanh sữa organic Vinamilk - Da đẹp hơn thật sự!',
    author_name: 'beauty_guru_vn',
    author_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=BG',
    media_type: 'VIDEO',
    published_at: '2026-01-28T14:00:00Z',
    likes: 35000,
    shares: 4200,
    views: 720000,
    comment_count: 2100,
    kpi_targets: {
      engagement: 3500,
      buzz: 2100,
      interaction: 2800,
      view: 8750,
    },
  },
  {
    platform: 'INSTAGRAM',
    platform_post_id: 'ig_kol4_vinamilk_001',
    url: 'https://www.instagram.com/reel/DWKBC0WOpD1',
    content: 'Cà phê sữa organic - combo hoàn hảo cho buổi sáng!',
    author_name: 'food_blogger_sg',
    author_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=FB',
    media_type: 'IMAGE',
    published_at: '2026-02-01T08:00:00Z',
    likes: 9800,
    shares: 220,
    views: 120000,
    comment_count: 560,
    kpi_targets: { engagement: 900, buzz: 540, interaction: 720, view: 2250 },
  },
];

// Campaign 3: GrabFood Promo
const campaign3Posts: PostSeed[] = [
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_grabfood_promo_001',
    url: 'https://www.facebook.com/photo/?fbid=1511719143648000&set=a.652564606230129',
    content: 'Siêu ưu đãi GrabFood! Giảm 50% cho đơn hàng đầu tiên. Đặt ngay!',
    author_name: 'Grab Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=GR',
    media_type: 'IMAGE',
    published_at: '2026-01-11T07:00:00Z',
    likes: 8900,
    shares: 2800,
    views: 320000,
    comment_count: 1500,
    kpi_targets: {
      engagement: 2000,
      buzz: 1200,
      interaction: 1600,
      view: 5000,
    },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_grabfood_promo_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content:
      'Ai đói bụng chưa? GrabFood giảm giá cực sốc đây nè! #GrabFood #GiamGia',
    author_name: 'grab_vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=GR',
    media_type: 'VIDEO',
    published_at: '2026-01-13T12:00:00Z',
    likes: 28000,
    shares: 4500,
    views: 650000,
    comment_count: 1800,
    kpi_targets: {
      engagement: 2500,
      buzz: 1500,
      interaction: 2000,
      view: 6250,
    },
  },
  {
    platform: 'INSTAGRAM',
    platform_post_id: 'ig_grabfood_jan_001',
    url: 'https://www.instagram.com/p/DWwWtWSklXh/',
    content: 'Đói bụng? GrabFood giao tận nơi chỉ 15 phút! Giảm 30% hôm nay',
    author_name: 'grab_vn',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=GR',
    media_type: 'IMAGE',
    published_at: '2026-01-15T11:00:00Z',
    likes: 5200,
    shares: 150,
    views: 72000,
    comment_count: 380,
    kpi_targets: { engagement: 700, buzz: 420, interaction: 560, view: 1750 },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_grabfood_fast_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content: 'GrabFood giao hàng trong 15 phút! Nhanh hơn nấu mì gói',
    author_name: 'grab_vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=GR',
    media_type: 'VIDEO',
    published_at: '2026-01-20T12:00:00Z',
    likes: 32000,
    shares: 5600,
    views: 890000,
    comment_count: 2100,
    kpi_targets: {
      engagement: 3500,
      buzz: 2100,
      interaction: 2800,
      view: 8750,
    },
  },
];

// Campaign 4: Shopee Tết Sale
const campaign4Posts: PostSeed[] = [
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_shopee_tet_001',
    url: 'https://www.facebook.com/quahdd/posts/pfbid02d8Py9s8nzmRrAVmx33W61Bn8RkNNXr4Vgzxye2wiuodNhjNCTvREPabK9kV9PcSol',
    content:
      'SHOPEE TẾT SALE - Giảm đến 90%! Mua sắm Tết thả ga, không lo về giá!',
    author_name: 'Shopee Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SP',
    media_type: 'VIDEO',
    published_at: '2026-01-12T00:00:00Z',
    likes: 25000,
    shares: 8900,
    views: 1200000,
    comment_count: 4500,
    kpi_targets: {
      engagement: 6000,
      buzz: 3600,
      interaction: 4800,
      view: 15000,
    },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_shopee_tet_deals_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content:
      'Săn deal Tết cùng Shopee! Freeship XTRA cho mọi đơn hàng #ShopeeTet',
    author_name: 'shopee_vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SP',
    media_type: 'VIDEO',
    published_at: '2026-01-14T10:00:00Z',
    likes: 56000,
    shares: 12000,
    views: 2500000,
    comment_count: 3200,
    kpi_targets: {
      engagement: 6500,
      buzz: 3900,
      interaction: 5200,
      view: 16250,
    },
  },
  {
    platform: 'INSTAGRAM',
    platform_post_id: 'ig_shopee_tet_001',
    url: 'https://www.instagram.com/reel/DWKBC0WOpD1',
    content: 'Lì xì Shopee Coins cho tất cả! Mua sắm Tết siêu tiết kiệm',
    author_name: 'shopee_vn',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SP',
    media_type: 'CAROUSEL',
    published_at: '2026-01-16T08:00:00Z',
    likes: 18000,
    shares: 3400,
    views: 520000,
    comment_count: 2100,
    kpi_targets: {
      engagement: 4000,
      buzz: 2400,
      interaction: 3200,
      view: 10000,
    },
  },
  {
    platform: 'YOUTUBE',
    platform_post_id: 'yt_shopee_tet_ad_001',
    url: 'https://youtu.be/K01LvulhFRg',
    content: 'Shopee Tết Sale 2026 - TVC Chính Thức ft. Trấn Thành',
    author_name: 'Shopee Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SP',
    media_type: 'VIDEO',
    published_at: '2026-01-11T06:00:00Z',
    likes: 38000,
    shares: 15000,
    views: 8500000,
    comment_count: 5200,
    kpi_targets: {
      engagement: 8000,
      buzz: 4800,
      interaction: 6400,
      view: 20000,
    },
  },
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_shopee_countdown_001',
    url: 'https://www.facebook.com/groups/861108920047086/permalink/922189230605721/',
    content: 'Đếm ngược Tết Sale! Chỉ còn 3 ngày - Deal sốc từ 1K',
    author_name: 'Shopee Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SP',
    media_type: 'IMAGE',
    published_at: '2026-01-25T00:00:00Z',
    likes: 18000,
    shares: 5200,
    views: 680000,
    comment_count: 2800,
    kpi_targets: {
      engagement: 4500,
      buzz: 2700,
      interaction: 3600,
      view: 11250,
    },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_shopee_haul_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content:
      'Shopee haul Tết 2026! Mua được bao nhiêu đồ với 500K? #ShopeeHaul',
    author_name: 'shopee_vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SP',
    media_type: 'VIDEO',
    published_at: '2026-01-28T16:00:00Z',
    likes: 42000,
    shares: 8800,
    views: 1800000,
    comment_count: 2500,
    kpi_targets: {
      engagement: 4000,
      buzz: 2400,
      interaction: 3200,
      view: 10000,
    },
  },
];

// Campaign 5: VinFast VF 7 Launch
const campaign5Posts: PostSeed[] = [
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_vf7_launch_001',
    url: 'https://www.facebook.com/reel/1312599174101620',
    content:
      'VinFast VF 7 - Chiếc SUV điện thông minh cho gia đình hiện đại. Đặt xe ngay hôm nay!',
    author_name: 'VinFast Official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VF',
    media_type: 'VIDEO',
    published_at: '2026-01-10T08:00:00Z',
    likes: 32000,
    shares: 6700,
    views: 890000,
    comment_count: 4500,
    kpi_targets: {
      engagement: 8500,
      buzz: 5100,
      interaction: 6800,
      view: 21250,
    },
  },
  {
    platform: 'YOUTUBE',
    platform_post_id: 'yt_vf7_review_001',
    url: 'https://www.youtube.com/watch?v=K01LvulhFRg',
    content: 'Trải nghiệm thực tế VinFast VF 7 - Đánh giá chi tiết từ A-Z',
    author_name: 'VinFast Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VF',
    media_type: 'VIDEO',
    published_at: '2026-01-15T14:00:00Z',
    likes: 18000,
    shares: 3200,
    views: 1200000,
    comment_count: 2800,
    kpi_targets: {
      engagement: 5500,
      buzz: 3300,
      interaction: 4400,
      view: 13750,
    },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_vf7_pov_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content:
      'POV: Lái VF 7 lần đầu tiên. Cảm giác tuyệt vời! #VinFast #VF7 #OtoĐien',
    author_name: 'vinfast_official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VF',
    media_type: 'VIDEO',
    published_at: '2026-01-18T16:00:00Z',
    likes: 65000,
    shares: 8900,
    views: 1800000,
    comment_count: 5200,
    kpi_targets: {
      engagement: 10000,
      buzz: 6000,
      interaction: 8000,
      view: 25000,
    },
  },
  {
    platform: 'INSTAGRAM',
    platform_post_id: 'ig_vf7_interior_001',
    url: 'https://www.instagram.com/p/DWwWtWSklXh/',
    content: 'Nội thất VF 7 - Sang trọng, hiện đại, đầy đủ tiện nghi',
    author_name: 'vinfast_official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VF',
    media_type: 'CAROUSEL',
    published_at: '2026-01-22T10:00:00Z',
    likes: 12000,
    shares: 1500,
    views: 280000,
    comment_count: 890,
    kpi_targets: { engagement: 1200, buzz: 720, interaction: 960, view: 3000 },
  },
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_vf7_price_001',
    url: 'https://www.facebook.com/photo/?fbid=1511719143648000&set=a.652564606230129',
    content: 'VF 7 công bố giá bán chính thức - Chỉ từ 999 triệu đồng!',
    author_name: 'VinFast Official',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=VF',
    media_type: 'IMAGE',
    published_at: '2026-01-25T08:00:00Z',
    likes: 45000,
    shares: 12000,
    views: 1500000,
    comment_count: 8200,
    kpi_targets: {
      engagement: 15000,
      buzz: 9000,
      interaction: 12000,
      view: 37500,
    },
  },
];

// Campaign 6: Samsung Galaxy S26
const campaign6Posts: PostSeed[] = [
  {
    platform: 'YOUTUBE',
    platform_post_id: 'yt_galaxy_s26_teaser_001',
    url: 'https://youtu.be/K01LvulhFRg',
    content: 'Galaxy S26 Ultra - Đỉnh cao công nghệ AI. Coming Soon!',
    author_name: 'Samsung Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SS',
    media_type: 'VIDEO',
    published_at: '2026-01-16T06:00:00Z',
    likes: 45000,
    shares: 12000,
    views: 3200000,
    comment_count: 6800,
    kpi_targets: {
      engagement: 12000,
      buzz: 7200,
      interaction: 9600,
      view: 30000,
    },
  },
  {
    platform: 'FACEBOOK',
    platform_post_id: 'fb_galaxy_s26_preview_001',
    url: 'https://www.facebook.com/quahdd/posts/pfbid02d8Py9s8nzmRrAVmx33W61Bn8RkNNXr4Vgzxye2wiuodNhjNCTvREPabK9kV9PcSol',
    content:
      'Khám phá Galaxy S26 Ultra - Camera AI 200MP, Pin 6000mAh. Đăng ký nhận ưu đãi sớm!',
    author_name: 'Samsung Vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SS',
    media_type: 'IMAGE',
    published_at: '2026-01-20T08:00:00Z',
    likes: 28000,
    shares: 5600,
    views: 920000,
    comment_count: 3500,
    kpi_targets: {
      engagement: 5000,
      buzz: 3000,
      interaction: 4000,
      view: 12500,
    },
  },
  {
    platform: 'TIKTOK',
    platform_post_id: 'tt_s26_unbox_001',
    url: 'https://www.tiktok.com/@irias_official/video/7601798039182822674',
    content: 'Đập hộp Galaxy S26 Ultra - Thiết kế titanium mới quá đẹp!',
    author_name: 'samsung_vietnam',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SS',
    media_type: 'VIDEO',
    published_at: '2026-01-28T15:00:00Z',
    likes: 72000,
    shares: 15000,
    views: 3800000,
    comment_count: 4500,
    kpi_targets: {
      engagement: 8500,
      buzz: 5100,
      interaction: 6800,
      view: 21250,
    },
  },
  {
    platform: 'INSTAGRAM',
    platform_post_id: 'ig_galaxy_s26_photo_001',
    url: 'https://www.instagram.com/reel/DWKBC0WOpD1',
    content: 'Chụp ảnh với Galaxy S26 Ultra 200MP - Chi tiết đến từng pixel',
    author_name: 'samsung_vn',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SS',
    media_type: 'IMAGE',
    published_at: '2026-01-30T10:00:00Z',
    likes: 22000,
    shares: 3200,
    views: 450000,
    comment_count: 1800,
    kpi_targets: {
      engagement: 3000,
      buzz: 1800,
      interaction: 2400,
      view: 7500,
    },
  },
  {
    platform: 'THREADS',
    platform_post_id: 'th_galaxy_s26_thread_001',
    url: 'https://www.threads.com/@claudeai/post/DW1vkzzFAdl',
    content:
      'Galaxy S26 Ultra - Trải nghiệm AI phone đỉnh cao. Bạn đã sẵn sàng chưa?',
    author_name: 'samsung_vn',
    author_avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SS',
    media_type: 'TEXT',
    published_at: '2026-02-01T09:00:00Z',
    likes: 8500,
    shares: 1200,
    views: 180000,
    comment_count: 960,
    kpi_targets: {
      engagement: 1500,
      buzz: 900,
      interaction: 1200,
      view: 3750,
    },
  },
];

// ─── Comment generation ─────────────────────────────────────────────

interface CommentSeed {
  post_id: string;
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'THREADS';
  platform_comment_id: string;
  content: string;
  author_name: string;
  author_profile_url: string;
  like_count: number;
  reply_count: number;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  emotions: ('JOY' | 'ANGER' | 'SADNESS' | 'FEAR' | 'SURPRISE' | 'DISGUST')[];
  confidence_score: number;
  language: string;
  platform_created_at: Date;
}

const commenters: { name: string; handle: string }[] = [
  { name: 'Nguyễn Văn An', handle: 'nguyenvanan' },
  { name: 'Trần Thị Bích', handle: 'tranthibich' },
  { name: 'Lê Hoàng Nam', handle: 'lehoangnam' },
  { name: 'Phạm Minh Tuấn', handle: 'phamminhtuan' },
  { name: 'Hoàng Thị Mai', handle: 'hoangthimai' },
  { name: 'Vũ Đức Thắng', handle: 'vuducthang' },
  { name: 'Đặng Thu Hà', handle: 'dangthuha' },
  { name: 'Bùi Quang Huy', handle: 'buiquanghuy' },
  { name: 'Ngô Thanh Tâm', handle: 'ngothanhtam' },
  { name: 'Dương Khánh Linh', handle: 'duongkhanhlinh' },
  { name: 'Lý Gia Bảo', handle: 'lygiabao' },
  { name: 'Phan Thị Ngọc', handle: 'phanthingoc' },
  { name: 'Đỗ Hữu Phước', handle: 'dohuuphuoc' },
  { name: 'Trịnh Mỹ Duyên', handle: 'trinhmyduyen' },
  { name: 'Cao Văn Lộc', handle: 'caovanloc' },
  { name: 'Hồ Thuỳ Trang', handle: 'hothuytrang' },
];

const profileUrlBuilders: Record<CommentSeed['platform'], (handle: string) => string> = {
  FACEBOOK: (handle) => `https://facebook.com/${handle}`,
  INSTAGRAM: (handle) => `https://instagram.com/${handle}`,
  TIKTOK: (handle) => `https://tiktok.com/@${handle}`,
  YOUTUBE: (handle) => `https://youtube.com/@${handle}`,
  THREADS: (handle) => `https://threads.net/@${handle}`,
};

function generateCommentsForPost(
  postId: string,
  platform: PostSeed['platform'],
  commentCount: number,
  baseDate: Date,
): {
  comments: CommentSeed[];
  replies: (CommentSeed & { parent_index: number })[];
} {
  const count = Math.min(Math.ceil(commentCount / 50), 20);
  const comments: CommentSeed[] = [];
  const replies: (CommentSeed & { parent_index: number })[] = [];

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate.getTime() + i * 3600000 * randomInt(1, 12));
    const sentimentKey = randomItem(sentiments);
    const replyCount = randomInt(0, 15);
    const commenter = randomItem(commenters);

    comments.push({
      post_id: postId,
      platform,
      platform_comment_id: `${platform.toLowerCase()}_comment_${postId}_${i}`,
      content: randomItem(vietnameseCommentTemplates[sentimentKey]),
      author_name: commenter.name,
      author_profile_url: profileUrlBuilders[platform](commenter.handle),
      like_count: randomInt(0, 500),
      reply_count: replyCount,
      sentiment: sentimentMap[sentimentKey],
      emotions: [randomItem(emotions)],
      confidence_score: Math.round((Math.random() * 0.3 + 0.7) * 100) / 100,
      language: 'vi',
      platform_created_at: date,
    });

    // Generate some replies
    if (replyCount > 0) {
      const actualReplies = Math.min(replyCount, 3);
      for (let j = 0; j < actualReplies; j++) {
        const replyDate = new Date(date.getTime() + (j + 1) * 1800000);
        const replySentimentKey = randomItem(sentiments);
        const replyCommenter = randomItem(commenters);
        replies.push({
          post_id: postId,
          platform,
          platform_comment_id: `${platform.toLowerCase()}_reply_${postId}_${i}_${j}`,
          content: randomItem(vietnameseCommentTemplates[replySentimentKey]),
          author_name: replyCommenter.name,
          author_profile_url: profileUrlBuilders[platform](replyCommenter.handle),
          like_count: randomInt(0, 100),
          reply_count: 0,
          sentiment: sentimentMap[replySentimentKey],
          emotions: [randomItem(emotions)],
          confidence_score: Math.round((Math.random() * 0.3 + 0.7) * 100) / 100,
          language: 'vi',
          platform_created_at: replyDate,
          parent_index: comments.length - 1,
        });
      }
    }
  }

  return { comments, replies };
}

/**
 * Development-only seed data.
 * The default admin account is created via migration (seed_default_admin).
 */
async function main() {
  // Clean existing data (reverse dependency order)
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.campaignMembership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.projectMembership.deleteMany();
  await prisma.project.deleteMany();
  await prisma.category.deleteMany();
  await prisma.socialAccountPost.deleteMany();
  await prisma.profileCategory.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.kolCategory.deleteMany();
  await prisma.kolTier.deleteMany();
  await prisma.user.deleteMany();

  // Seed project categories
  await prisma.category.createMany({
    data: CATEGORY_NAMES.map((name) => ({ name })),
    skipDuplicates: true,
  });
  const categories = await prisma.category.findMany();
  const fmcgCat = categories.find((c) => c.name === 'FMCG')!;
  const fbCat = categories.find((c) => c.name === 'F&B')!;
  const techCat = categories.find((c) => c.name === 'Tech')!;
  const autoCat = categories.find((c) => c.name === 'Automotive')!;
  const ecomCat = categories.find((c) => c.name === 'E-commerce')!;

  // Seed KOL categories
  await prisma.kolCategory.createMany({
    data: KOL_CATEGORIES,
    skipDuplicates: true,
  });
  const kolCategories = await prisma.kolCategory.findMany();
  const kolCatMap = new Map(kolCategories.map((c) => [c.name, c.id]));

  // Seed KOL tiers
  await prisma.kolTier.createMany({
    data: KOL_TIERS,
    skipDuplicates: true,
  });
  const kolTiers = await prisma.kolTier.findMany();
  const kolTierMap = new Map(kolTiers.map((t) => [t.name, t.id]));

  // Test users (development only)
  const password = await bcrypt.hash('password123', 10);

  await prisma.user.create({
    data: {
      email: 'admin@sociallistening.com',
      password_hash: password,
      name: 'Admin User',
      role: 'ADMIN',
      status: 'ACTIVE',
      last_login_at: new Date(),
      invitation_accepted_at: new Date(),
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@sociallistening.com',
      password_hash: password,
      name: 'Campaign Manager',
      role: 'INTERNAL_USER',
      status: 'ACTIVE',
      last_login_at: new Date(),
      invitation_accepted_at: new Date(),
    },
  });

  const analyst = await prisma.user.create({
    data: {
      email: 'analyst@sociallistening.com',
      password_hash: password,
      name: 'Data Analyst',
      role: 'AUTHORIZED_USER',
      status: 'ACTIVE',
      last_login_at: new Date(),
      invitation_accepted_at: new Date(),
    },
  });

  const viewer = await prisma.user.create({
    data: {
      email: 'viewer@sociallistening.com',
      password_hash: password,
      name: 'Client Viewer',
      role: 'AUTHORIZED_USER',
      status: 'ACTIVE',
      last_login_at: new Date(),
      invitation_accepted_at: new Date(),
    },
  });

  // ─── Projects ───────────────────────────────────────────────────

  const project1 = await prisma.project.create({
    data: {
      name: 'Vinamilk - Q1 2026',
      description: 'Organic milk launch campaign monitoring',
      client_name: 'Vinamilk',
      categories: {
        create: [
          { category_id: fmcgCat.id },
          { category_id: fbCat.id },
        ],
      },
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Grab Vietnam - Q1 2026',
      description: 'GrabFood & GrabBike campaign monitoring',
      client_name: 'Grab',
      categories: {
        create: [{ category_id: ecomCat.id }],
      },
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: 'Shopee Vietnam - Tết 2026',
      description: 'Shopee Tết Sale campaign monitoring',
      client_name: 'Shopee',
      categories: {
        create: [{ category_id: ecomCat.id }],
      },
    },
  });

  const project4 = await prisma.project.create({
    data: {
      name: 'VinFast - VF Series 2026',
      description: 'VinFast VF 7 launch and charging network campaigns',
      client_name: 'VinFast',
      categories: {
        create: [{ category_id: autoCat.id }],
      },
    },
  });

  const project5 = await prisma.project.create({
    data: {
      name: 'Samsung Vietnam - Galaxy S26',
      description: 'Samsung Galaxy S26 and Galaxy AI campaigns',
      client_name: 'Samsung',
      categories: {
        create: [{ category_id: techCat.id }],
      },
    },
  });

  // ─── Memberships ────────────────────────────────────────────────

  const projects = [project1, project2, project3, project4, project5];
  await prisma.projectMembership.createMany({
    data: projects.flatMap((p) => [
      { user_id: manager.id, project_id: p.id, role: 'MANAGER' as const },
      { user_id: analyst.id, project_id: p.id, role: 'ANALYST' as const },
      { user_id: viewer.id, project_id: p.id, role: 'VIEWER' as const },
    ]),
  });

  // ─── Campaigns ──────────────────────────────────────────────────

  const campaignDefs = [
    {
      project_id: project1.id,
      name: 'Organic Milk TVC',
      description: 'TVC campaign for organic milk launch',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-03-31'),
      status: 'ACTIVE' as const,
      platforms: [
        'FACEBOOK' as const,
        'INSTAGRAM' as const,
        'YOUTUBE' as const,
        'TIKTOK' as const,
      ],
      posts: campaign1Posts,
    },
    {
      project_id: project1.id,
      name: 'KOL Collaboration Q1',
      description: 'KOL partnerships for organic milk promotion',
      start_date: new Date('2026-01-15'),
      end_date: new Date('2026-03-15'),
      status: 'ACTIVE' as const,
      platforms: ['INSTAGRAM' as const, 'TIKTOK' as const],
      posts: campaign2Posts,
    },
    {
      project_id: project2.id,
      name: 'GrabFood Promo January',
      description: 'GrabFood January promotion campaigns',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-01-31'),
      status: 'COMPLETED' as const,
      platforms: ['FACEBOOK' as const, 'TIKTOK' as const, 'INSTAGRAM' as const],
      posts: campaign3Posts,
    },
    {
      project_id: project3.id,
      name: 'Shopee Tết Sale 2026',
      description: 'Shopee Tết mega sale campaign',
      start_date: new Date('2026-01-05'),
      end_date: new Date('2026-02-15'),
      status: 'ACTIVE' as const,
      platforms: [
        'FACEBOOK' as const,
        'TIKTOK' as const,
        'INSTAGRAM' as const,
        'YOUTUBE' as const,
      ],
      posts: campaign4Posts,
    },
    {
      project_id: project4.id,
      name: 'VinFast VF 7 Launch',
      description: 'VF 7 product launch campaign',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-04-30'),
      status: 'ACTIVE' as const,
      platforms: [
        'FACEBOOK' as const,
        'YOUTUBE' as const,
        'TIKTOK' as const,
        'INSTAGRAM' as const,
      ],
      posts: campaign5Posts,
    },
    {
      project_id: project5.id,
      name: 'Galaxy S26 Launch',
      description: 'Samsung Galaxy S26 Ultra launch campaign',
      start_date: new Date('2026-01-10'),
      end_date: new Date('2026-03-31'),
      status: 'ACTIVE' as const,
      platforms: [
        'YOUTUBE' as const,
        'FACEBOOK' as const,
        'TIKTOK' as const,
        'INSTAGRAM' as const,
      ],
      posts: campaign6Posts,
    },
  ];

  // ─── Profiles, Social Accounts & Profile Categories ─────────────

  for (const profileData of PROFILES) {
    const tierId = kolTierMap.get(profileData.tier);
    const profile = await prisma.profile.create({
      data: {
        name: profileData.name,
        gender: profileData.gender,
        email: profileData.email,
        phone: profileData.phone,
        tags: profileData.tags,
        ...(tierId && { tier_id: tierId }),
      },
    });

    // Create social accounts
    const socialAccounts = getSocialAccounts(profileData.name, profileData.tier);
    const isMega = profileData.tier === 'Mega';
    for (const account of socialAccounts) {
      await prisma.socialAccount.create({
        data: {
          profile_id: profile.id,
          platform: account.platform,
          platform_user_id: `${account.platform.toLowerCase()}_${account.username}`,
          username: account.username,
          display_name: account.display_name,
          follower_count: account.follower_count,
          is_verified: isMega,
        },
      });
    }

    // Create profile categories
    const categoryIds = profileData.categories
      .map((catName) => kolCatMap.get(catName))
      .filter((id): id is string => !!id);

    if (categoryIds.length > 0) {
      await prisma.profileCategory.createMany({
        data: categoryIds.map((kol_category_id) => ({
          profile_id: profile.id,
          kol_category_id,
        })),
        skipDuplicates: true,
      });
    }
  }

  // ─── Create campaigns, posts, and comments ──────────────────────

  let totalPosts = 0;
  let totalComments = 0;

  for (const def of campaignDefs) {
    const { posts: postSeeds, ...campaignData } = def;

    const campaign = await prisma.campaign.create({
      data: {
        ...campaignData,
        metric_polling_interval: 3600,
        comments_polling_interval: 21600,
        display_metrics: ['posts', 'comments', 'engagement', 'buzz', 'view'],
      },
    });

    // Add campaign membership for manager
    await prisma.campaignMembership.create({
      data: {
        user_id: manager.id,
        campaign_id: campaign.id,
        role: 'MANAGER',
        added_by: manager.id,
      },
    });

    for (const postSeed of postSeeds) {
      const post = await prisma.post.create({
        data: {
          campaign_id: campaign.id,
          platform: postSeed.platform,
          platform_post_id: postSeed.platform_post_id,
          url: postSeed.url,
          content: postSeed.content,
          author_name: postSeed.author_name,
          author_avatar: postSeed.author_avatar,
          media_type: postSeed.media_type,
          published_at: new Date(postSeed.published_at),
          likes: postSeed.likes,
          shares: postSeed.shares,
          views: postSeed.views,
          comment_count: postSeed.comment_count,
          metrics_snapshot: {
            likes: postSeed.likes,
            shares: postSeed.shares,
            views: postSeed.views,
            comments: postSeed.comment_count,
            engagement_rate:
              Math.round(
                ((postSeed.likes + postSeed.shares + postSeed.comment_count) /
                  postSeed.views) *
                  10000,
              ) / 100,
          },
          kpi_targets: postSeed.kpi_targets,
          last_polled_at: new Date(),
          last_poll_status: 'success',
        },
      });
      totalPosts++;

      // Generate comments for this post
      const baseDate = new Date(postSeed.published_at);
      const { comments, replies } = generateCommentsForPost(
        post.id,
        postSeed.platform,
        postSeed.comment_count,
        baseDate,
      );

      // Create parent comments
      const createdComments: { id: string }[] = [];
      for (const comment of comments) {
        const created = await prisma.comment.create({
          data: {
            post_id: comment.post_id,
            platform: comment.platform,
            platform_comment_id: comment.platform_comment_id,
            content: comment.content,
            author_name: comment.author_name,
            author_profile_url: comment.author_profile_url,
            like_count: comment.like_count,
            reply_count: comment.reply_count,
            sentiment: comment.sentiment,
            emotions: comment.emotions,
            confidence_score: comment.confidence_score,
            language: comment.language,
            platform_created_at: comment.platform_created_at,
          },
        });
        createdComments.push(created);
        totalComments++;
      }

      // Create replies
      for (const reply of replies) {
        const parentId = createdComments[reply.parent_index]?.id;
        if (parentId) {
          await prisma.comment.create({
            data: {
              post_id: reply.post_id,
              platform: reply.platform,
              platform_comment_id: reply.platform_comment_id,
              content: reply.content,
              author_name: reply.author_name,
              author_profile_url: reply.author_profile_url,
              like_count: reply.like_count,
              reply_count: 0,
              parent_comment_id: parentId,
              sentiment: reply.sentiment,
              emotions: reply.emotions,
              confidence_score: reply.confidence_score,
              language: reply.language,
              platform_created_at: reply.platform_created_at,
            },
          });
          totalComments++;
        }
      }
    }
  }

  console.log('Development seed completed successfully');
  console.log(
    `Created: ${totalPosts} posts, ${totalComments} comments across ${campaignDefs.length} campaigns`,
  );
  console.log(`Created ${PROFILES.length} profiles with social accounts`);
  console.log(`Created ${KOL_CATEGORIES.length} KOL categories`);
  console.log(`Created ${KOL_TIERS.length} KOL tiers`);
  console.log('Login: password123 for all test users');
  console.log('Admin: admin@sociallistening.com');
  console.log('Internal: manager@sociallistening.com');
  console.log('Authorized: analyst@, viewer@sociallistening.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
