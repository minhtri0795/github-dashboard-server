# GitHub Dashboard API Documentation

## Overview
This document describes the available endpoints for the GitHub Dashboard API. All endpoints accept and return JSON data.

## Base URL
```
https://api.sd-dev.pro/webhook/github
```

## Common Types

### DateFilterDto
Used for filtering data by date range.
```typescript
{
  startDate?: string;  // ISO date string (e.g., "2025-01-01T00:00:00.000Z")
  endDate?: string;    // ISO date string
}
```
If not provided, defaults to last 7 days.

## Endpoints

### Get All Pull Requests
Get all pull requests regardless of state.

```
GET /pull-requests
```

#### Response
```typescript
Array<{
  prNumber: number;
  title: string;
  html_url: string;
  repository: string;
  created_at: Date;
  state: string;
  user: {
    login: string;
    githubId: number;
  }
}>
```

### Get Pull Request Statistics
Get statistics about pull requests including daily activity.

```
GET /statistics
```

#### Query Parameters
| Parameter  | Type         | Required | Description                    |
|------------|--------------|----------|--------------------------------|
| startDate  | ISO Date     | No       | Start date for filtering data  |
| endDate    | ISO Date     | No       | End date for filtering data    |

#### Response
```typescript
{
  summary: {
    createdInRange: number;    // Total PRs created in date range
    openPRs: number;           // Currently open PRs
    closedInRange: number;     // PRs closed in date range
    mergedInRange: number;     // PRs merged in date range
    dateRange: {
      startDate: Date;
      endDate: Date;
    }
  },
  activity: {
    createdByDay: Array<{
      _id: string;             // Date in YYYY-MM-DD format
      count: number;           // Number of PRs for this day
      prs: Array<{            // Details of PRs
        prNumber: number;
        title: string;
        html_url: string;
        repository: string;
      }>
    }>,
    closedByDay: Array<...>,   // Same structure as createdByDay
    mergedByDay: Array<...>    // Same structure as createdByDay
  }
}
```

### Get Repository Statistics
Get pull request statistics grouped by repository.

```
GET /repository-stats
```

#### Response
```typescript
Array<{
  repository: string;
  totalPRs: number;
  openPRs: number;
  closedPRs: number;
  mergedPRs: number;
}>
```

### Get Open Pull Requests
Get a list of currently open pull requests.

```
GET /open-prs
```

#### Query Parameters
| Parameter  | Type         | Required | Description                    |
|------------|--------------|----------|--------------------------------|
| startDate  | ISO Date     | No       | Start date for filtering data  |
| endDate    | ISO Date     | No       | End date for filtering data    |

#### Response
```typescript
Array<{
  prNumber: number;
  title: string;
  html_url: string;
  repository: string;
  created_at: Date;
  user: {
    login: string;
    githubId: number;
  }
}>
```

### Get Closed Pull Requests
Get a list of closed pull requests.

```
GET /closed-prs
```

#### Query Parameters
| Parameter  | Type         | Required | Description                    |
|------------|--------------|----------|--------------------------------|
| startDate  | ISO Date     | No       | Start date for filtering data  |
| endDate    | ISO Date     | No       | End date for filtering data    |

#### Response
Same structure as Open Pull Requests.

### Get Commits by Date
Get a list of commits within a date range.

```
GET /commits
```

#### Query Parameters
| Parameter  | Type         | Required | Description                    |
|------------|--------------|----------|--------------------------------|
| startDate  | ISO Date     | No       | Start date for filtering data  |
| endDate    | ISO Date     | No       | End date for filtering data    |

#### Response
```typescript
Array<{
  sha: string;
  message: string;
  author: {
    login: string;
    githubId: number;
  };
  repository: string;
  created_at: Date;
}>
```

### Get Commit Statistics
Get statistics about commits.

```
GET /commit-statistics
```

#### Response
```typescript
{
  totalCommits: number;
  commitsByAuthor: Array<{
    author: {
      login: string;
      githubId: number;
    };
    commitCount: number;
  }>;
  commitsByDay: Array<{
    date: string;  // YYYY-MM-DD format
    count: number;
  }>;
}
```

### Get Self-Merged Pull Requests
Get a list of pull requests that were merged by the same person who created them.

```
GET /self-merged-prs
```

#### Query Parameters
| Parameter  | Type         | Required | Description                    |
|------------|--------------|----------|--------------------------------|
| startDate  | ISO Date     | No       | Start date for filtering data  |
| endDate    | ISO Date     | No       | End date for filtering data    |

#### Response
```typescript
Array<{
  prNumber: number;
  title: string;
  html_url: string;
  repository: string;
  created_at: Date;
  merged_at: Date;
  user: {
    login: string;
    githubId: number;
  },
  merged_by: {
    login: string;
    githubId: number;
  }
}>
```

## Error Responses
All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": ["error message details"],
  "error": "Bad Request"
}
```

### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

## Example Usage

### JavaScript/TypeScript with Fetch
```typescript
// Get PR statistics for last month
const startDate = new Date();
startDate.setMonth(startDate.getMonth() - 1);

const response = await fetch('https://api.sd-dev.pro/api/github/statistics?' + new URLSearchParams({
  startDate: startDate.toISOString(),
  endDate: new Date().toISOString()
}));

const data = await response.json();
```

### Axios Example
```typescript
import axios from 'axios';

// Get self-merged PRs for last week
const response = await axios.get('https://api.sd-dev.pro/api/github/self-merged-prs', {
  params: {
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-01-07T23:59:59.999Z'
  }
});

const selfMergedPRs = response.data;
