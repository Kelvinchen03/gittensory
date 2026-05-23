export type PublicContributorProfile = {
  login: string;
  name?: string | null | undefined;
  bio?: string | null | undefined;
  company?: string | null | undefined;
  publicRepos?: number | undefined;
  followers?: number | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  topLanguages: string[];
  source: "github" | "unavailable";
};

type GitHubUserResponse = {
  login: string;
  name?: string | null;
  bio?: string | null;
  company?: string | null;
  public_repos?: number;
  followers?: number;
  created_at?: string;
  updated_at?: string;
};

type GitHubRepoResponse = {
  language?: string | null;
};

export async function fetchPublicContributorProfile(login: string): Promise<PublicContributorProfile> {
  const safeLogin = encodeURIComponent(login);
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "gittensory/0.1",
    "x-github-api-version": "2022-11-28",
  };
  try {
    const [userResponse, reposResponse] = await Promise.all([
      fetch(`https://api.github.com/users/${safeLogin}`, { headers }),
      fetch(`https://api.github.com/users/${safeLogin}/repos?per_page=100&sort=updated`, { headers }),
    ]);
    if (!userResponse.ok) throw new Error(`GitHub user lookup failed (${userResponse.status})`);
    const user = (await userResponse.json()) as GitHubUserResponse;
    const repos = reposResponse.ok ? ((await reposResponse.json()) as GitHubRepoResponse[]) : [];
    const languageCounts = new Map<string, number>();
    for (const repo of repos) {
      if (!repo.language) continue;
      languageCounts.set(repo.language, (languageCounts.get(repo.language) ?? 0) + 1);
    }
    const topLanguages = [...languageCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([language]) => language);
    return {
      login: user.login,
      name: user.name,
      bio: user.bio,
      company: user.company,
      publicRepos: user.public_repos,
      followers: user.followers,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      topLanguages,
      source: "github",
    };
  } catch {
    return {
      login,
      topLanguages: [],
      source: "unavailable",
    };
  }
}
