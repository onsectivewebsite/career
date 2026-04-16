require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');

function upsertUser({ email, password, name, role, phone, headline, location }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  const hash = bcrypt.hashSync(password, 10);
  if (existing) {
    db.prepare(`UPDATE users SET name=?, role=?, phone=?, headline=?, location=? WHERE id=?`)
      .run(name, role, phone || null, headline || null, location || null, existing.id);
    return existing.id;
  }
  const info = db.prepare(
    `INSERT INTO users (email, password_hash, name, role, phone, headline, location)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(email.toLowerCase(), hash, name, role, phone || null, headline || null, location || null);
  return info.lastInsertRowid;
}

function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@onsective.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe!Admin2026';
  const adminName = process.env.ADMIN_NAME || 'Site Administrator';

  const adminId = upsertUser({
    email: adminEmail,
    password: adminPassword,
    name: adminName,
    role: 'admin'
  });

  // Sample HR user
  upsertUser({
    email: 'hr@onsective.com',
    password: 'ChangeMe!Hr2026',
    name: 'HR Team',
    role: 'hr'
  });

  // Sample employee (for referral portal testing)
  upsertUser({
    email: 'employee@onsective.com',
    password: 'ChangeMe!Emp2026',
    name: 'Sample Employee',
    role: 'employee',
    headline: 'Software Engineer',
    location: 'Remote'
  });

  // Leadership accounts (so their photos map to real people in the org)
  const leaders = [
    { email: 'rishabh@onsective.com', name: 'Rishabh', headline: 'Founder & CEO', role: 'admin' },
    { email: 'shabir@onsective.com', name: 'Shabir', headline: 'Co-Founder & CTO', role: 'admin' },
    { email: 'kavya@onsective.com', name: 'Kavya', headline: 'Head of People', role: 'hr' },
    { email: 'kumakshi@onsective.com', name: 'Kumakshi', headline: 'Head of Operations', role: 'employee' },
    { email: 'riyan@onsective.com', name: 'Riyan', headline: 'Head of Engineering', role: 'employee' }
  ];
  for (const l of leaders) {
    upsertUser({ ...l, password: 'ChangeMe!Leader2026' });
  }

  // Sample jobs
  const existingJobs = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
  if (existingJobs === 0) {
    const sample = [
      {
        title: 'Senior Full-Stack Engineer',
        department: 'Engineering',
        location: 'Remote (India / US)',
        employment_type: 'Full-time',
        experience_level: 'Senior (5+ years)',
        salary_range: '$90k – $140k',
        summary: 'Build and scale the Onsective platform end-to-end across web, API, and data services.',
        description: 'Join our core engineering team to design and ship features used by enterprises worldwide. You will own services from inception to production, collaborate with product and design, and help shape our technical direction.',
        requirements: '• 5+ years building production web applications\n• Strong JavaScript/TypeScript and Node.js\n• Experience with React (or similar) and SQL\n• Comfort with cloud infrastructure (AWS/GCP)\n• Excellent written communication',
        benefits: '• Competitive salary and equity\n• Fully remote, flexible hours\n• Health, dental, vision\n• Annual learning budget\n• Offsite retreats',
        referral_bonus: '$2,000'
      },
      {
        title: 'Cybersecurity Analyst',
        department: 'Security',
        location: 'Hybrid — Bengaluru',
        employment_type: 'Full-time',
        experience_level: 'Mid-level (3-5 years)',
        salary_range: '₹18L – ₹28L',
        summary: 'Monitor, investigate, and respond to security events across our customer environments.',
        description: 'You will be the front line of our managed security service — triaging alerts, running investigations, and tuning detections. Work closely with senior engineers and customers to raise their security posture.',
        requirements: '• 3+ years in SOC / incident response\n• Hands-on with SIEM (Splunk, Elastic, Sentinel)\n• Strong grasp of MITRE ATT&CK\n• Scripting in Python or PowerShell\n• Security certifications a plus (Security+, GCIH, OSCP)',
        benefits: '• 24x7 shift differential\n• Certification reimbursement\n• Comprehensive health coverage\n• Wellness stipend',
        referral_bonus: '₹75,000'
      },
      {
        title: 'Product Designer',
        department: 'Design',
        location: 'Remote (Global)',
        employment_type: 'Full-time',
        experience_level: 'Mid-level (3-5 years)',
        salary_range: '$70k – $110k',
        summary: 'Craft clear, calm interfaces for complex enterprise workflows.',
        description: 'We are looking for a designer who loves reducing complexity. You will partner with product and engineering to research, prototype, and ship interfaces that people actually enjoy using — even at 2 AM during an incident.',
        requirements: '• 3+ years designing SaaS products\n• Portfolio showing systems thinking\n• Fluency in Figma\n• Comfort running user research\n• Bonus: motion / prototyping experience',
        benefits: '• Fully remote\n• Hardware and workspace budget\n• Conference budget\n• Sabbatical after 4 years',
        referral_bonus: '$1,500'
      },
      {
        title: 'Technical Recruiter',
        department: 'People',
        location: 'Remote (India)',
        employment_type: 'Full-time',
        experience_level: 'Mid-level (2-4 years)',
        salary_range: '₹12L – ₹20L',
        summary: 'Partner with hiring managers to attract and close world-class engineers.',
        description: 'Own the full hiring funnel for technical roles. You will source, screen, coordinate, close, and continuously improve our process — with an emphasis on a great candidate experience.',
        requirements: '• 2+ years recruiting technical roles\n• Sourcing skills on LinkedIn and beyond\n• Clear written and spoken English\n• Data-driven mindset\n• Calm under pressure',
        benefits: '• Remote-first\n• Learning budget\n• Wellness stipend',
        referral_bonus: '₹50,000'
      },
      {
        title: 'Site Reliability Engineer',
        department: 'Engineering',
        location: 'Remote (US time zones)',
        employment_type: 'Full-time',
        experience_level: 'Senior (5+ years)',
        salary_range: '$110k – $160k',
        summary: 'Keep Onsective fast, observable, and boring.',
        description: 'Own reliability, observability, and infrastructure-as-code. You will build platforms that make it safe and easy for product engineers to ship.',
        requirements: '• 5+ years in SRE / DevOps\n• Kubernetes, Terraform, CI/CD\n• Strong Linux and networking fundamentals\n• Incident command experience',
        benefits: '• Competitive pay and equity\n• On-call differential\n• Comprehensive health coverage',
        referral_bonus: '$2,500'
      }
    ];
    const insert = db.prepare(`
      INSERT INTO jobs (title, department, location, employment_type, experience_level, salary_range, summary, description, requirements, benefits, referral_bonus, posted_by, status)
      VALUES (@title, @department, @location, @employment_type, @experience_level, @salary_range, @summary, @description, @requirements, @benefits, @referral_bonus, @posted_by, 'open')
    `);
    for (const j of sample) insert.run({ ...j, posted_by: adminId });
  }

  console.log('Seed complete.');
  console.log('Admin:', adminEmail, '/', adminPassword);
  console.log('HR:    hr@onsective.com / ChangeMe!Hr2026');
  console.log('Employee: employee@onsective.com / ChangeMe!Emp2026');
}

if (require.main === module) seed();
module.exports = { seed };
