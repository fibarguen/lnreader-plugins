import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class TheGeeseHut implements Plugin.PluginBase {
  id = 'thegersehut';
  name = 'The Geese Hut';
  icon = '/src/en/TheGeeseHut/favicon.ico';
  site = 'https://geesehut.blogspot.com/';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    const FEED_URL = this.site + 'feeds/pages/default?alt=json';
    const res = await fetchApi(FEED_URL);
    const json = await res.json();
    const entries = json?.feed?.entry ?? [];

    type FeedEntry = {
      title?: { $t?: string };
      link?: { rel?: string; href?: string }[];
      media$thumbnail?: { url?: string };
    };

    novels.push(
      ...entries.map((entry: FeedEntry) => {
        const title = entry.title?.$t ?? '';
        const link =
          (entry.link ?? []).find(
            (l: { rel?: string; href?: string }) => l.rel === 'alternate',
          )?.href ?? '#';

        return {
          name: title,
          path: link.replace(this.site, ''),
          cover: defaultCover,
        };
      }),
    );
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    const MAX = 50;
    const url = this.site + novelPath;
    const res = await fetchApi(url);
    const body = await res.text();
    const loadedCheerio = loadCheerio(body);
    const label = loadedCheerio('.novel-title').text().trim();

    const name = loadedCheerio('#novel-info h1').text().trim();
    novel.name = name;
    novel.artist = 'Unknown';
    novel.author = 'Unknown';
    novel.cover = defaultCover;
    novel.status =
      loadedCheerio('#novel-status').text().trim() || NovelStatus.Ongoing;
    novel.summary = loadedCheerio('#novel-synopsis').text().trim();

    const chapters: Plugin.ChapterItem[] = [];
    const seenUrls = new Set();
    let start = 1;

    let continueLoop = true;
    while (continueLoop) {
      const url =
        `${this.site}/feeds/posts/summary/-/${encodeURIComponent(label)}` +
        `?alt=json&start-index=${start}&max-results=${MAX}`;

      const res = await fetchApi(url);
      const json = await res.json();
      const entries = json?.feed?.entry ?? [];

      if (!entries.length) continueLoop = false;

      for (const entry of entries) {
        const title = entry.title?.$t ?? '';
        const link = (entry.link ?? []).find(
          (l: { rel?: string; href?: string }) => l.rel === 'alternate',
        );
        const url = link?.href ?? null;
        const date = entry.published?.$t ?? null;

        if (title != name) {
          if (url && title && !seenUrls.has(url)) {
            chapters.push({
              name: title,
              path: url.replace(this.site, ''),
              releaseTime: date,
            });
            seenUrls.add(url);
          }
        }
      }

      start += MAX;
    }

    chapters.sort((a, b) => {
      const timeA = a.releaseTime ? new Date(a.releaseTime).getTime() : 0;
      const timeB = b.releaseTime ? new Date(b.releaseTime).getTime() : 0;
      return timeA - timeB;
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const res = await fetchApi(url);
    const body = await res.text();
    const loadedCheerio = loadCheerio(body);
    const chapterText = loadedCheerio('div.paper-content').html() || '';
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    let novels: Plugin.NovelItem[] = [];

    const url = `${this.site}feeds/pages/default?alt=json`;
    const res = await fetch(url);
    const json = await res.json();
    const entries = json?.feed?.entry ?? [];

    type FeedEntry = {
      title?: { $t?: string };
      link?: { rel?: string; href?: string }[];
      media$thumbnail?: { url?: string };
    };

    novels.push(
      ...entries.map((entry: FeedEntry) => {
        const title = entry.title?.$t ?? '';
        const link =
          (entry.link ?? []).find(
            (l: { rel?: string; href?: string }) => l.rel === 'alternate',
          )?.href ?? '#';
        return {
          name: title,
          path: link.replace(this.site, ''),
          cover: defaultCover,
        };
      }),
    );
    novels = novels.filter(novel =>
      novel.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
    return novels;
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new TheGeeseHut();
