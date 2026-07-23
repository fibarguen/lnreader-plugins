import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class Yukikitsuneko implements Plugin.PluginBase {
  id = 'yukikitsuneko';
  name = 'Yuki Kitsuneko';
  icon = 'src/en/yukikitsuneko/logo.png';
  site = 'https://yukikitsuneko.blogspot.com/';
  version = '1.2.8';
  filters: Filters | undefined = undefined;
  imageRequestInit: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    const MAX = 500;
    const FEED_URL =
      this.site +
      `feeds/pages/summary/-/Series?alt=json&start-index=1&max-results=${MAX}`;

    const res = await fetchApi(FEED_URL);
    const json = await res.json();
    const entries = json?.feed?.entry ?? [];

    type FeedEntry = {
      title?: { $t?: string };
      link?: { rel?: string; href?: string }[];
      media$thumbnail?: { url?: string };
    };

    entries.forEach((element: FeedEntry) => {
      const title = element.title?.$t ?? '';
      const link =
        (element.link ?? []).find(
          (l: { rel?: string; href?: string }) => l.rel === 'alternate',
        )?.href ?? '#';
      const cover = element.media$thumbnail?.url || defaultCover;
      if (
        !title.toLowerCase().includes('series list') &&
        !title.toLowerCase().includes('dmca') &&
        !title.toLowerCase().includes('about')
      ) {
        novels.push({
          name: title,
          path: link.replace(this.site, ''),
          cover: cover,
        });
      }
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();
    const loadedCheerio = loadCheerio(body);

    // Get novel details
    const novelName = loadedCheerio('h1.card-title').text().trim();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: novelName,
      cover: loadedCheerio('.col-12 img').attr('src') || defaultCover,
    };

    novel.genres = loadedCheerio('dd.col-sm-9:nth-child(2)').text().trim();
    novel.author = loadedCheerio('dd.col-sm-9:nth-child(6)').text().trim();
    const status = loadedCheerio('dd.col-sm-9:nth-child(10)')
      .text()
      .trim()
      .toLowerCase();
    novel.status =
      status === 'on-going' || status === 'ongoing'
        ? NovelStatus.Ongoing
        : NovelStatus.Completed;

    novel.summary = loadedCheerio(
      'section[aria-labelledby="series-description-heading"] p',
    )
      .map((_, el) => loadedCheerio(el).text())
      .get()
      .join('\n');

    // Get chapters
    const chapters: Plugin.ChapterItem[] = [];
    const Volumes: Plugin.ChapterItem[] = [];
    const noveltitle =
      loadedCheerio("meta[property='og:title']").attr('content') || '';

    const seenUrls = new Set();
    let start = 1;
    const MAX = 500;

    let continueLoop = true;
    while (continueLoop) {
      const url =
        `${this.site}feeds/posts/summary/-/${encodeURIComponent(noveltitle)}` +
        `?alt=json&start-index=${start}&max-results=${MAX}`;

      const res = await fetchApi(url);
      const json = await res.json();
      const entries = json?.feed?.entry ?? [];

      if (!entries.length) continueLoop = false;

      for (const entry of entries) {
        let title = entry.title?.$t ?? '';
        const link = (entry.link ?? []).find(
          (l: { rel?: string; href?: string }) => l.rel === 'alternate',
        );
        const url = link?.href ?? null;
        const date = entry.published?.$t ?? null;

        const escapeRegExp = (s: string) =>
          s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

        const stripNovelTitlePrefix = (title: string, novelTitle: string) => {
          const pattern = new RegExp(
            String.raw`^${escapeRegExp(novelTitle)}(?:\s*[:\-]\s*|\s+)`,
            'i',
          );
          return title.replace(pattern, '').trim();
        };

        let cleanedTitle = stripNovelTitlePrefix(title, noveltitle);

        if (noveltitle === 'Hero at 17 Going Home With My Family') {
          const novelT = 'Hero at 17, Going Home with My Family';
          cleanedTitle = stripNovelTitlePrefix(title, novelT);
        }

        title = cleanedTitle || title;

        if (title != noveltitle) {
          if (url && title && !seenUrls.has(url)) {
            const labels =
              entry.category?.map((cat: { term?: string }) => cat.term) || [];
            if (
              labels.some((item: string) =>
                item.toLowerCase().includes('volume'),
              )
            ) {
              const volume: Plugin.ChapterItem = {
                name: title,
                releaseTime: date,
                path: url.replace(this.site, ''),
                chapterNumber: chapters.length + 1,
              };
              Volumes.push(volume);
            } else {
              const chapter: Plugin.ChapterItem = {
                name: title,
                releaseTime: date,
                path: url.replace(this.site, ''),
                chapterNumber: chapters.length + 1,
              };
              chapters.push(chapter);
            }
            seenUrls.add(url);
          }
        }
      }
      start += entries.length;
    }
    chapters.sort((a, b) => {
      const timeA = a.releaseTime ? new Date(a.releaseTime).getTime() : 0;
      const timeB = b.releaseTime ? new Date(b.releaseTime).getTime() : 0;
      return timeA - timeB;
    });

    // Merge Volumes and chapters, placing volumes first
    // Volumes.reverse();
    Volumes.forEach(volume => chapters.unshift(volume));

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // parse chapter text here
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const loadedCheerio = loadCheerio(body);
    loadedCheerio('.mt-5').remove();
    loadedCheerio('ul li.ms-3').remove();
    loadedCheerio('p:contains("Premium Supporters")').remove();
    loadedCheerio('p:contains("Thank you for making this possible!")').remove();
    loadedCheerio('.mb-4').remove();
    return loadedCheerio('div.entry-content').html() || '';
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    let novels: Plugin.NovelItem[] = [];

    const url =
      `${this.site}feeds/pages/summary/-/Series` + `?alt=json&max-results=500`;
    const res = await fetch(url);
    const json = await res.json();
    const entries = json?.feed?.entry ?? [];

    type FeedEntry = {
      title?: { $t?: string };
      link?: { rel?: string; href?: string }[];
      media$thumbnail?: { url?: string };
    };

    entries.forEach((element: FeedEntry) => {
      const title = element.title?.$t ?? '';
      const link =
        (element.link ?? []).find(
          (l: { rel?: string; href?: string }) => l.rel === 'alternate',
        )?.href ?? '#';
      const cover = element.media$thumbnail?.url || defaultCover;
      if (
        !title.toLowerCase().includes('series list') &&
        !title.toLowerCase().includes('dmca') &&
        !title.toLowerCase().includes('about')
      ) {
        novels.push({
          name: title,
          path: link.replace(this.site, ''),
          cover: cover,
        });
      }
    });
    novels = novels.filter(novel =>
      novel.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    return novels;
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new Yukikitsuneko();
