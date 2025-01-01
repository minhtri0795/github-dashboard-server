import { MongoClient } from 'mongodb';

async function seed() {
  const uri =
    'mongodb+srv://developers:5kvYVm94koDXrcOZ@cluster0.djprg.mongodb.net/sd-dashboard?retryWrites=true&w=majority&appName=Cluster0&tls=true';
  const client = new MongoClient(uri, {
    ssl: true,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  try {
    await client.connect();
    const db = client.db('sd-dashboard');

    // Clear existing data
    await db.collection('users').deleteMany({});
    await db.collection('pullrequests').deleteMany({});

    // Insert users
    const users = [
      {
        githubId: 1001,
        login: 'john.doe',
        name: 'John Doe',
        avatarUrl: 'https://github.com/john.doe.png',
        type: 'User',
        company: 'TechCorp',
      },
      {
        githubId: 1002,
        login: 'jane.smith',
        name: 'Jane Smith',
        avatarUrl: 'https://github.com/jane.smith.png',
        type: 'User',
        company: 'DevInc',
      },
      {
        githubId: 1003,
        login: 'bob.wilson',
        name: 'Bob Wilson',
        avatarUrl: 'https://github.com/bob.wilson.png',
        type: 'User',
        company: 'CodeCo',
      },
    ];

    const insertedUsers = await db.collection('users').insertMany(users);
    console.log('Inserted users:', insertedUsers.insertedCount);

    // Insert PRs
    const prs = [
      // Open PRs
      {
        prNumber: 101,
        title: 'Feature: Add user authentication',
        status: 'opened',
        author: insertedUsers.insertedIds[0],
        htmlUrl: 'https://github.com/org/repo1/pull/101',
        branchName: 'feature/auth',
        repositoryName: 'org/repo1',
        createdAt: new Date('2024-12-20'),
        merged: false,
      },
      {
        prNumber: 102,
        title: 'Fix: Database connection issue',
        status: 'opened',
        author: insertedUsers.insertedIds[1],
        htmlUrl: 'https://github.com/org/repo2/pull/102',
        branchName: 'fix/db-connection',
        repositoryName: 'org/repo2',
        createdAt: new Date('2024-12-25'),
        merged: false,
      },
      // Closed PRs
      {
        prNumber: 103,
        title: 'Feature: Add API endpoints',
        status: 'closed',
        author: insertedUsers.insertedIds[2],
        htmlUrl: 'https://github.com/org/repo1/pull/103',
        branchName: 'feature/api',
        repositoryName: 'org/repo1',
        createdAt: new Date('2024-12-15'),
        closedAt: new Date('2024-12-18'),
        merged: true,
      },
      {
        prNumber: 104,
        title: 'Update: Documentation',
        status: 'closed',
        author: insertedUsers.insertedIds[0],
        htmlUrl: 'https://github.com/org/repo2/pull/104',
        branchName: 'update/docs',
        repositoryName: 'org/repo2',
        createdAt: new Date('2024-12-10'),
        closedAt: new Date('2024-12-12'),
        merged: false,
      },
      // More recent PRs
      {
        prNumber: 105,
        title: 'Feature: Dashboard UI',
        status: 'opened',
        author: insertedUsers.insertedIds[1],
        htmlUrl: 'https://github.com/org/repo1/pull/105',
        branchName: 'feature/dashboard',
        repositoryName: 'org/repo1',
        createdAt: new Date('2024-12-28'),
        merged: false,
      },
      {
        prNumber: 106,
        title: 'Fix: Performance issues',
        status: 'closed',
        author: insertedUsers.insertedIds[2],
        htmlUrl: 'https://github.com/org/repo2/pull/106',
        branchName: 'fix/performance',
        repositoryName: 'org/repo2',
        createdAt: new Date('2024-12-26'),
        closedAt: new Date('2024-12-29'),
        merged: true,
      },
    ];

    const insertedPRs = await db.collection('pullrequests').insertMany(prs);
    console.log('Inserted PRs:', insertedPRs.insertedCount);

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await client.close();
  }
}

seed();
