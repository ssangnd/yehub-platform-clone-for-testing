import type { Comment } from '@/types/comment'
import type { Platform } from '@/types/filters'
import type { Sentiment, EmotionType } from '@/types/insight'

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
}


function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const sentiments: Sentiment[] = ['positive', 'neutral', 'negative']
const emotions: EmotionType[] = ['joy', 'anger', 'sadness', 'fear', 'surprise', 'disgust']

export function generateComment(
  id: string,
  postId: string,
  campaignId: string,
  platform: Platform,
  dateStr: string,
  parentCommentId?: string,
): Comment {
  const sentiment = randomItem(sentiments)
  const templates = vietnameseCommentTemplates[sentiment]

  return {
    id,
    postId,
    campaignId,
    platform,
    content: randomItem(templates),
    language: 'vi',
    publishedAt: dateStr,
    likes: randomInt(0, 500),
    replyCount: parentCommentId ? 0 : randomInt(0, 15),
    parentCommentId,
    isNoise: Math.random() < 0.05,
    sentiment,
    emotions: [{ type: randomItem(emotions), score: Math.random() * 0.5 + 0.5 }],
    confidenceScore: Math.random() * 0.3 + 0.7,
    createdAt: dateStr,
  }
}

export function generateComments(count: number, postId: string, campaignId: string, platform: Platform): Comment[] {
  const comments: Comment[] = []
  const baseDate = new Date('2026-01-15T00:00:00Z')

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate.getTime() + i * 3600000 * randomInt(1, 12))
    const comment = generateComment(
      `comment-${postId}-${i}`,
      postId,
      campaignId,
      platform,
      date.toISOString(),
    )
    comments.push(comment)

    // Add some replies
    if (comment.replyCount > 0) {
      const replyCount = Math.min(comment.replyCount, 3)
      for (let j = 0; j < replyCount; j++) {
        const replyDate = new Date(date.getTime() + (j + 1) * 1800000)
        comments.push(
          generateComment(
            `comment-${postId}-${i}-reply-${j}`,
            postId,
            campaignId,
            platform,
            replyDate.toISOString(),
            comment.id,
          )
        )
      }
    }
  }

  return comments
}
