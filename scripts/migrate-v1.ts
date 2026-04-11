/**
 * V1 → V2 Migration Script
 * Migrates Amazon project data from workspace files into Taskflow V2 database
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PROJECT_ID = 'cmnostkx50001sgwb4li7efvh';

async function migrate() {
  console.log('🚀 Starting V1 → V2 Migration...\n');

  // ─── 1. Create Task Categories ───
  console.log('📂 Creating task categories...');
  const categories = [
    { name: 'Listings & Catalog', color: '#6366f1' },
    { name: 'Amazon Ads / PPC', color: '#f59e0b' },
    { name: 'Analytics & KPI', color: '#10b981' },
    { name: 'Operations', color: '#8b5cf6' },
    { name: 'Account Health', color: '#ef4444' },
    { name: 'Cross-Domain', color: '#64748b' },
  ];

  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const existing = await prisma.taskCategory.findFirst({
      where: { projectId: PROJECT_ID, name: cat.name },
    });
    if (existing) {
      categoryMap[cat.name] = existing.id;
      console.log(`  ✓ ${cat.name} (exists: ${existing.id})`);
    } else {
      const created = await prisma.taskCategory.create({
        data: { projectId: PROJECT_ID, name: cat.name, color: cat.color, order: Object.keys(categoryMap).length },
      });
      categoryMap[cat.name] = created.id;
      console.log(`  + ${cat.name} (${created.id})`);
    }
  }

  // ─── 2. Create Sub-Agents ───
  console.log('\n🤖 Creating sub-agents...');
  const agents = [
    { name: 'amz-orchestrator', caps: ['coordination', 'routing', 'planning'], trust: 'full' },
    { name: 'amz-listings', caps: ['seo', 'listing_optimization', 'title_writing', 'keyword_research', 'backend_keywords'], trust: 'supervised' },
    { name: 'amz-ads', caps: ['ppc_management', 'campaign_analysis', 'bid_optimization', 'acos_monitoring'], trust: 'supervised' },
    { name: 'amz-analytics', caps: ['data_analysis', 'kpi_tracking', 'business_reports', 'conversion_analysis'], trust: 'supervised' },
    { name: 'amz-operations', caps: ['pricing', 'handling_time', 'review_management', 'account_health', 'shipping'], trust: 'supervised' },
    { name: 'amz-governance', caps: ['risk_classification', 'approval_protocol', 'compliance_audit'], trust: 'restricted' },
  ];

  const agentMap: Record<string, string> = {};
  for (const agent of agents) {
    const existing = await prisma.actor.findFirst({ where: { name: agent.name, type: 'AGENT' } });
    if (existing) {
      agentMap[agent.name] = existing.id;
      console.log(`  ✓ ${agent.name} (exists)`);
    } else {
      const created = await prisma.actor.create({
        data: { name: agent.name, type: 'AGENT', trustLevel: agent.trust },
      });
      for (const cap of agent.caps) {
        await prisma.actorCapability.create({
          data: { actorId: created.id, capabilityName: cap, proficiencyLevel: 4 },
        });
      }
      agentMap[agent.name] = created.id;
      console.log(`  + ${agent.name} (${created.id})`);
    }
  }

  // ─── 3. Create Tasks (from V1 STATUS.md task list) ───
  console.log('\n📋 Creating tasks...');

  const tasks = [
    // Listings & Catalog
    { cat: 'Listings & Catalog', title: 'Bullet Point Optimizasyonu (200+ karakter)', desc: 'Tüm aktif listing\'lerin bullet point\'lerini 80 karakterden 200+ karaktere çıkar. Keyword-rich, müşteri odaklı yazım. Öncelik: Top 10 ASIN.', priority: 'urgent', type: 'action', platform: 'shopify', status: 'todo', agent: 'amz-listings' },
    { cat: 'Listings & Catalog', title: 'Backend Search Terms Doldurma (250 byte)', desc: 'Boş olan backend keyword alanlarını 250 byte sınırına kadar doldur. SP-API batch_keywords.py scripti kullanılabilir.', priority: 'urgent', type: 'action', status: 'todo', agent: 'amz-listings' },
    { cat: 'Listings & Catalog', title: 'Title SEO Optimizasyonu', desc: 'Title\'ları Amazon SEO best practice\'lerine göre yeniden yaz. Brand + ana keyword + özellik + varyasyon formatı. docs/title_optimization_draft.md referans.', priority: 'high', type: 'action', status: 'todo', agent: 'amz-listings' },
    { cat: 'Listings & Catalog', title: 'A+ Content Oluşturma', desc: 'Top performer ürünler için A+ Content tasarla. Görsel + metin modülleri hazırla.', priority: 'medium', type: 'action', status: 'todo', agent: 'amz-listings' },
    { cat: 'Listings & Catalog', title: 'Search Suppressed Listing İnceleme', desc: '29 listing search suppressed — tümü main image eksik (Amazon Handmade policy sorunu, beyaz arkaplan). Kullanıcı kararı: Bu konuyla ilgilenmeyeceğiz.', priority: 'low', type: 'audit', status: 'done' },

    // Amazon Ads / PPC
    { cat: 'Amazon Ads / PPC', title: 'PPC Kampanyaları Yeniden Başlatma', desc: 'Tüm kampanyalar durdurulmuş. 153 not-delivering hedef var. Önce hedefleri temizle, sonra top performer ASIN\'ler için yeni Sponsored Products kampanyaları oluştur. Düşük budget ile başla.', priority: 'high', type: 'action', status: 'todo', agent: 'amz-ads' },
    { cat: 'Amazon Ads / PPC', title: 'SP-API Reklam Raporu Analizi', desc: 'Son 30 günlük reklam harcama ve performans verisini çek. ACOS, impressions, clicks analiz et. Kampanya bazlı performans raporla.', priority: 'medium', type: 'audit', status: 'done', agent: 'amz-analytics' },

    // Analytics & KPI
    { cat: 'Analytics & KPI', title: 'Organik Trafik Baseline Ölçümü', desc: 'Reklamlar kapalıyken organik trafik seviyesini belirle. docs/organic_baseline.md referans. Haftalık izleme başlat.', priority: 'medium', type: 'monitor', status: 'todo', agent: 'amz-analytics' },

    // Operations
    { cat: 'Operations', title: 'Handling Time Düşürme (7 gün → 1-2 gün)', desc: 'Seller Central → Shipping Settings → Handling Time. 7 günden 1-2 güne düşür. Featured Offer oranını %66 → %90+ çıkaracak kritik adım.', priority: 'urgent', type: 'action', status: 'todo', agent: 'amz-operations' },
    { cat: 'Operations', title: 'Review Stratejisi Başlatma', desc: 'Vine programı veya Request a Review özelliğini aktifleştir. İlk 5-10 review hedefle. Hiçbir üründe review yok.', priority: 'medium', type: 'action', status: 'todo', agent: 'amz-operations' },
    { cat: 'Operations', title: 'MX/CA Suspended Listings İnceleme', desc: 'Kanada ve Meksika marketplace\'lerinde suspended listing\'leri kontrol et. Düşük öncelik — sadece US\'e odaklanıyoruz şu an.', priority: 'low', type: 'audit', status: 'todo', agent: 'amz-operations' },

    // Account Health
    { cat: 'Account Health', title: 'Hesap Sağlığı Haftalık İzleme', desc: 'SP-API account_health komutu ile haftalık hesap durumu kontrolü. ODR, Late Shipment Rate, Policy Compliance takibi.', priority: 'low', type: 'monitor', status: 'todo', agent: 'amz-operations' },

    // Cross-Domain
    { cat: 'Cross-Domain', title: 'SP-API Entegrasyonu', desc: 'Amazon SP-API developer başvurusu onaylandı. LWA credentials alındı. scripts/sp_api.py ile 11 komut çalışıyor. Tüm 6 agent skill\'ine referanslar eklendi.', priority: 'medium', type: 'action', status: 'done' },
    { cat: 'Cross-Domain', title: 'Taskflow API Entegrasyonu', desc: 'Nested REST endpoint yapısı düzeltildi. Tüm kategori ID\'leri doğrulandı. API üzerinden CRUD + log işlemleri test edildi.', priority: 'medium', type: 'action', status: 'done' },
    { cat: 'Cross-Domain', title: 'Conversion Rate Acil Aksiyon Planı', desc: '%0.10 conversion rate (kategori ort: %5-15). 1917 session → 2 sipariş. En çok trafik alan ASIN (748 session) bile satış üretmemiş. Listing optimizasyonu + A+ Content + Review ile %3-5 hedef.', priority: 'urgent', type: 'report', status: 'todo', agent: 'amz-analytics' },
  ];

  for (const t of tasks) {
    const existing = await prisma.task.findFirst({
      where: { projectId: PROJECT_ID, title: t.title },
    });
    if (existing) {
      console.log(`  ✓ ${t.title} (exists)`);
      continue;
    }

    const task = await prisma.task.create({
      data: {
        projectId: PROJECT_ID,
        categoryId: categoryMap[t.cat],
        title: t.title,
        description: t.desc,
        priority: t.priority,
        taskType: t.type,
        platform: t.platform || null,
        status: t.status,
      },
    });

    // Assign agent if specified
    if (t.agent && agentMap[t.agent]) {
      await prisma.taskAssignment.create({
        data: { taskId: task.id, actorId: agentMap[t.agent], role: 'ASSIGNEE' },
      });
    }

    // Log creation
    await prisma.taskActivity.create({
      data: { taskId: task.id, eventType: 'task_created', description: `Migrated from V1: ${t.title}` },
    });

    console.log(`  + [${t.status}] (${t.priority}) ${t.title}`);
  }

  // ─── 4. Save Project Context ───
  console.log('\n📝 Saving project context...');

  const contexts = [
    {
      key: 'project-brief',
      value: `# World of Wedding Co. — Amazon Handmade Optimizasyonu

## Proje Özeti
Amazon Handmade US marketplace'inde düğün davetiyesi, şişe açacağı magnet ve metal wall art satan mağazanın performans optimizasyonu projesi.

## Mağaza Profili
- Platform: Amazon Handmade (US — ATVPDKIKX0DER)
- Toplam Listing: 215 (205 Active, 10 Incomplete)
- Fulfillment: FBM (Merchant Fulfilled)
- Fiyat Aralığı: $5-$109
- Toplam Satış: 2 sipariş ($276)

## Kritik Metrikler (Mart 2026)
- Conversion Rate: %0.10 (hedef: %3-5)
- Featured Offer: %66.7 (hedef: %90+)
- Günlük Session: ~10 (eski: ~45)
- Trafik Düşüşü: %75 (reklamlar kapatıldı)

## Stratejik Öncelikler
1. Handling Time düşürme (7→1-2 gün) → Featured Offer artışı
2. Listing optimizasyonu (bullet, keyword, A+) → Conversion artışı
3. Reklam yeniden başlatma → Trafik artışı
4. Review stratejisi → Uzun vadeli güven`,
    },
    {
      key: 'sp-api-config',
      value: `# SP-API Konfigürasyonu
- Credentials: sp-api.env dosyasında
- Script: scripts/sp_api.py (11 komut)
- Marketplace: ATVPDKIKX0DER (US)
- Raporlar: reports/ dizininde
  - listings_all.tsv (22 Mar 2026)
  - sales_traffic_report.json (1 Feb - 23 Mar 2026)
  - keyword_update_results.json`,
    },
    {
      key: 'agent-team',
      value: `# Agent Takım Yapısı
6 uzman agent skills/ dizininde tanımlı:
- amz-orchestrator: Merkezi koordinator, istek yönlendirme
- amz-listings: SEO, title, bullet, backend keywords, suppression
- amz-ads: PPC kampanya yönetimi, bid, ACOS
- amz-analytics: KPI takibi, Business Reports, conversion analizi
- amz-operations: Fiyat, handling time, review, account health
- amz-governance: Risk sınıflandırma, onay protokolü

## Governance Çıktı Formatı
Her agent çıktısı 7 adım: Gözlem → Kanıt → Analiz → Öneri → Risk → Onay → Sonraki Adım`,
    },
  ];

  for (const ctx of contexts) {
    const existing = await prisma.projectContext.findFirst({
      where: { projectId: PROJECT_ID, key: ctx.key },
    });
    if (existing) {
      console.log(`  ✓ ${ctx.key} (exists, v${existing.version})`);
    } else {
      await prisma.projectContext.create({
        data: { projectId: PROJECT_ID, key: ctx.key, value: ctx.value, version: 1 },
      });
      console.log(`  + ${ctx.key} (v1)`);
    }
  }

  // ─── 5. Save Knowledge Base ───
  console.log('\n📚 Saving knowledge base...');

  const knowledge = [
    { title: 'SP-API Entegrasyon Deneyimi', type: 'lesson_learned', content: 'SP-API developer başvurusu 1 iş günü sürdü. LWA credentials alımı sorunsuz. Token yönetimi önemli — her 1 saatte refresh gerekiyor. scripts/sp_api.py 11 komutla tüm ihtiyaçları karşılıyor.' },
    { title: 'Taskflow V1 API Yapısı', type: 'lesson_learned', content: 'Eski endpoint yapısı (GET /api/tasks?projectId=...) 404 dönüyordu. Doğru yapı nested REST: POST /api/categories/{categoryId}/tasks. Bu deneyim V2 tasarımını etkiledi.' },
    { title: 'Search Suppressed Listing Kararı', type: 'decision_rationale', content: '29 listing search suppressed — tümü main image eksik. Amazon Handmade görsel policy sorunu: beyaz arkaplan gereksinimi. Karar: Bu konuyla ilgilenmeyeceğiz çünkü Amazon policy sorunu, biz çözemeyiz. Öncelik listing optimizasyonuna verildi.' },
    { title: 'Trafik Çöküşü Root Cause', type: 'technical_note', content: '12 Mart 2026: 37 session/gün → 13 Mart: 9 session/gün (%75 düşüş). Root cause: Tüm PPC kampanyaları durduruldu. Organik trafik yeterli değil — reklam bağımlılığı yüksek. Çözüm: Reklam + organik SEO paralel strateji.' },
    { title: 'Featured Offer Stratejisi', type: 'technical_note', content: 'Featured Offer oranı %66.7. Handling time 7 gün → rakipler 1-3 gün. Amazon algoritması handling time\'ı Buy Box kriterlerinden biri olarak kullanıyor. 1-2 güne düşürülmesi %90+ FO beklentisi yaratıyor.' },
    { title: 'Conversion Rate Benchmark', type: 'reference', content: 'Amazon Handmade kategori ortalaması %5-15 conversion rate. Mevcut: %0.10. 1,917 session → 2 sipariş. Top ASIN (B0FXBXQ3M8, 748 session) bile 0 satış. Listing kalitesi ana sorun.' },
    { title: 'Governance 7-Adım Output Formatı', type: 'process_note', content: 'Her agent çıktısı: 1) Gözlem (ne görüldü) 2) Kanıt (veri kaynağı) 3) Analiz (ne anlama geliyor) 4) Öneri (aksiyon) 5) Risk (seviye + gerekçe) 6) Onay (no_approval/ask_first/explicit_approval) 7) Sonraki Adım (somut aksiyon)' },
  ];

  for (const k of knowledge) {
    const existing = await prisma.knowledgeBase.findFirst({
      where: { projectId: PROJECT_ID, title: k.title },
    });
    if (existing) {
      console.log(`  ✓ ${k.title} (exists)`);
    } else {
      await prisma.knowledgeBase.create({
        data: { projectId: PROJECT_ID, title: k.title, type: k.type, content: k.content, tags: '[]' },
      });
      console.log(`  + [${k.type}] ${k.title}`);
    }
  }

  // ─── Summary ───
  const taskCount = await prisma.task.count({ where: { projectId: PROJECT_ID } });
  const agentCount = await prisma.actor.count({ where: { type: 'AGENT' } });
  const contextCount = await prisma.projectContext.count({ where: { projectId: PROJECT_ID } });
  const knowledgeCount = await prisma.knowledgeBase.count({ where: { projectId: PROJECT_ID } });

  console.log('\n✅ Migration complete!');
  console.log(`   Tasks: ${taskCount}`);
  console.log(`   Agents: ${agentCount}`);
  console.log(`   Context entries: ${contextCount}`);
  console.log(`   Knowledge entries: ${knowledgeCount}`);

  await prisma.$disconnect();
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
