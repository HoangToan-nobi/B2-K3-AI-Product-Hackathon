import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

function pgPoolConnectionString(value: string | undefined): string | undefined {
  if (!value) return value
  const url = new URL(value)
  url.searchParams.delete('sslmode')
  return url.toString()
}

const connectionString = pgPoolConnectionString(process.env.DATABASE_URL)
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

type ChatlogRecord = {
  user_id?: string
  content?: string
  message?: string
  timestamp?: string
  message_created_at?: string
}

async function main() {
  console.log('Starting seed...')
  
  // Clean DB
  await prisma.citation.deleteMany()
  await prisma.studentQuestion.deleteMany()
  await prisma.chatMessage.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.knowledgeItem.deleteMany()
  await prisma.knowledgePack.deleteMany()
  await prisma.slideChunk.deleteMany()
  await prisma.slidePage.deleteMany()
  await prisma.slideDeck.deleteMany()
  await prisma.transcript.deleteMany()
  await prisma.lesson.deleteMany()
  await prisma.course.deleteMany()
  await prisma.user.deleteMany()

  // Create Users
  const student = await prisma.user.create({
    data: { id: 'student_demo', name: 'Học viên demo', email: 'student@example.com', role: 'student' }
  })
  void student
  const labcoach = await prisma.user.create({
    data: { id: 'labcoach_demo', name: 'Lab Coach demo', email: 'labcoach@example.com', role: 'labcoach' }
  })
  const admin = await prisma.user.create({
    data: { id: 'admin_demo', name: 'Admin', email: 'admin@example.com', role: 'admin' }
  })

  // Create Course
  const course = await prisma.course.create({
    data: { title: 'VLearn Hackathon Course', ownerId: admin.id }
  })

  // Read data directory
  const dataDir = path.join(process.cwd(), '../../data/vlearn-pack')
  
  // Seed Slides -> Lessons
  const slidesDir = path.join(dataDir, 'slides')
  const slideFiles = fs.readdirSync(slidesDir).filter(f => f.endsWith('.pdf')).sort()
  
  const lessonIds: string[] = []
  let dayCounter = 1;
  for (const file of slideFiles) {
     const lessonId = `day${dayCounter}-lesson`
     lessonIds.push(lessonId)
     const lesson = await prisma.lesson.create({
       data: {
         id: lessonId,
         courseId: course.id,
         title: `Day ${dayCounter} - ${file}`,
         createdBy: labcoach.id,
         status: 'published'
       }
     })
     
     await prisma.slideDeck.create({
       data: {
         lessonId: lesson.id,
         originalFilename: file,
         storageKey: path.join('../../data/vlearn-pack/slides', file),
         mimeType: 'application/pdf',
         pageCount: 30, // mock
         status: 'ready',
         uploadedBy: labcoach.id
       }
     })
     dayCounter++
  }

  // Seed Transcripts
  const transcriptDir = path.join(dataDir, 'transcript')
  const transcriptFiles = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.md')).sort()
  
  for (let i = 0; i < transcriptFiles.length; i++) {
     const file = transcriptFiles[i]
     const content = fs.readFileSync(path.join(transcriptDir, file), 'utf8')
     const lessonId = lessonIds[Math.min(i, lessonIds.length - 1)] // map to available lessons
     await prisma.transcript.create({
       data: {
         lessonId: lessonId,
         filename: file,
         content: content
       }
     })
  }

  // Seed Chatlog
  const chatlogFile = path.join(dataDir, 'chatlog/chat_history_anonymized_for_hackathon.csv')
  const csvData = fs.readFileSync(chatlogFile, 'utf8')
  const records = parse(csvData, { columns: true, skip_empty_lines: true }) as ChatlogRecord[]
  
  console.log(`Parsed ${records.length} chat records. Seeding all records...`)
  
  const chatImports = []
  for (let i = 0; i < records.length; i++) {
     const record = records[i]
     chatImports.push({
        lessonId: lessonIds[0], // link to day 1 for now
        anonymizedUserId: record.user_id || 'anonymous',
        message: record.content || record.message || '',
        createdAt: record.message_created_at || record.timestamp ? new Date(record.message_created_at || record.timestamp || '') : new Date()
     })
  }
  
  if (chatImports.length > 0) {
      await prisma.studentQuestion.createMany({ data: chatImports })
  }

  // Seed a KnowledgePack for day 1 so UI doesn't look empty
  const pack = await prisma.knowledgePack.create({
    data: {
      id: 'pack-day1-foundation-001',
      lessonId: lessonIds[0],
      status: 'published'
    }
  })
  
  await prisma.knowledgeItem.create({
    data: {
      packId: pack.id,
      type: 'summary',
      title: 'Tóm tắt bài 1',
      content: 'Nội dung tóm tắt mock',
      status: 'ready'
    }
  })

  console.log('Seeding finished successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
