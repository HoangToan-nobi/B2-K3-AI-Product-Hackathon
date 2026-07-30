import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import fs from 'fs'
import path from 'path'

const adapter = new PrismaBetterSqlite3({ url: 'dev.db' })
const prisma = new PrismaClient({ adapter })

type SlideJson = {
  pages: Array<{
    page: number
    text: string
  }>
}

type ReviewPackSeedItem = {
  title?: string
  topic?: string
  misconception?: string
  question?: string
  insight?: string
  content?: string
  correct_understanding?: string
  correction?: string
  answer?: string
  action?: string
  confidence?: number
  status?: string
  source_pages?: number[]
  source_excerpt?: string
  cluster_id?: string
  evidence?: string
}

async function main() {
  console.log('Start seeding...')

  await prisma.knowledgeItem.deleteMany()
  await prisma.knowledgePack.deleteMany()
  await prisma.slidePage.deleteMany()
  await prisma.slideDeck.deleteMany()
  await prisma.lesson.deleteMany()
  await prisma.course.deleteMany()

  // Create users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vlearn.edu' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@vlearn.edu',
      role: 'admin',
    },
  })

  const labcoach = await prisma.user.upsert({
    where: { email: 'coach@vlearn.edu' },
    update: {},
    create: {
      name: 'Lab Coach 1',
      email: 'coach@vlearn.edu',
      role: 'labcoach',
    },
  })

  const student = await prisma.user.upsert({
    where: { email: 'student@vlearn.edu' },
    update: {},
    create: {
      name: 'Student 1',
      email: 'student@vlearn.edu',
      role: 'student',
    },
  })
  void student

  // Create course
  const course = await prisma.course.create({
    data: {
      title: 'AI Product Hackathon',
      description: 'Demo course for the hackathon',
      ownerId: admin.id,
    },
  })

  // Read review pack data
  const reviewPackPath = path.join(__dirname, '../../shared/review-pack-day1-foundation.json')
  const reviewPackData = JSON.parse(fs.readFileSync(reviewPackPath, 'utf8'))

  // Create lesson
  const lesson = await prisma.lesson.create({
    data: {
      id: reviewPackData.lesson.id,
      title: reviewPackData.lesson.title,
      courseId: course.id,
      createdBy: labcoach.id,
      status: 'published',
    },
  })

  // Create SlideDeck (mock)
  const slideDeck = await prisma.slideDeck.create({
    data: {
      lessonId: lesson.id,
      originalFilename: 'slide-day1-foundation.pdf',
      storageKey: 'local/day1-foundation.pdf', // Mock storage key
      mimeType: 'application/pdf',
      pageCount: reviewPackData.lesson.slide_count,
      status: 'ready',
      uploadedBy: labcoach.id,
    },
  })

  // Read slides data for pages and chunks
  const slidePath = path.join(__dirname, '../../shared/slide-day1-foundation.json')
  let slidesData: SlideJson = { pages: [] }
  try {
    slidesData = JSON.parse(fs.readFileSync(slidePath, 'utf8')) as SlideJson
  } catch {
    console.warn('Could not read slide-day1-foundation.json, skipping slide pages.')
  }

  // Create pages
  const pageIdMap = new Map()
  for (const page of slidesData.pages) {
    const slidePage = await prisma.slidePage.create({
      data: {
        deckId: slideDeck.id,
        pageNumber: page.page,
        textContent: page.text,
      },
    })
    pageIdMap.set(page.page, slidePage.id)
  }

  // Create knowledge pack
  const knowledgePack = await prisma.knowledgePack.create({
    data: {
      lessonId: lesson.id,
      version: 1,
      status: 'published',
      generatedBy: 'system',
      generatedAt: new Date(),
      publishedAt: new Date(),
    },
  })

  // Helper to map and create items
  async function createItems(items: ReviewPackSeedItem[] | undefined, type: string) {
    if (!items) return;
    for (const item of items) {
      await prisma.knowledgeItem.create({
        data: {
          packId: knowledgePack.id,
          type: type,
          title: item.title || item.topic || item.misconception || item.question || item.insight || 'Untitled',
          content: item.content || item.correct_understanding || item.correction || item.answer || item.action || JSON.stringify(item),
          confidence: item.confidence || 1.0,
          status: item.status || 'approved',
          metadata: JSON.stringify({
            source_pages: item.source_pages,
            source_excerpt: item.source_excerpt,
            cluster_id: item.cluster_id,
            evidence: item.evidence,
          })
        },
      })
    }
  }

  await createItems(reviewPackData.summary, 'summary')
  await createItems(reviewPackData.class_insights, 'insight')
  await createItems(reviewPackData.blindspots, 'blindspot')
  await createItems(reviewPackData.review_questions, 'qa')
  
  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
