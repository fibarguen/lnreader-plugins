import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class ReadhivePlugin implements Plugin.PluginBase {
  id = 'readhive';
  name = 'ReadHive';
  icon = '/src/en/Readhive/icon.jpg';
  site = 'https://readhive.org';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit: Plugin.ImageRequestInit | undefined = undefined;

  webStorageUtilized?: boolean;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/page/${pageNo}/`;
    const res = await fetchApi(url);
    const body = await res.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];

    $('a.peer').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).find('img').attr('alt')?.replace('thumbnail', '');
      let cover = $(el).find('img').attr('src');

      if (cover?.includes('.webp')) {
        cover = this.site + cover;
      }

      if (!href || !title) return;

      novels.push({
        name: title,
        path: href.replace(this.site, ''),
        cover: cover || defaultCover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    const url = this.site + novelPath;
    const res = await fetchApi(url);
    const body = await res.text();
    const $ = loadCheerio(body);

    const infoDiv = $('main');
    if (!infoDiv.length) return novel;

    novel.name = infoDiv.find('h1').first().text().trim();
    novel.cover = infoDiv.find('img.object-cover').attr('src') || defaultCover;
    novel.author = infoDiv.find('span.leading-7').first().text().trim();
    novel.status = NovelStatus.Ongoing;

    // Synopsis
    const synopsisParts: string[] = [];
    $(
      'section.relative.grid.grid-cols-1.lg\\:grid-areas-series__body.lg\\:grid-cols-series.gap-x-4.px-4.py-2.sm\\:px-8 div.mb-4 > p',
    ).each((_, el) => {
      synopsisParts.push($(el).text().trim());
    });
    novel.summary = synopsisParts.join('\n');

    // Tags / Genres
    const tagList: string[] = [];
    $(
      'section.relative.grid.grid-cols-1.lg\\:grid-areas-series__body.lg\\:grid-cols-series.gap-x-4.px-4.py-2.sm\\:px-8 > div.lg\\:grid-in-content.mt-4 > div:nth-child(1) > div:nth-child(2) > div.flex.flex-wrap > a',
    ).each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) tagList.push(tag);
    });
    novel.genres = tagList.join(', ');

    // Chapters
    const chapters: Plugin.ChapterItem[] = [];

    $(
      'section.relative.grid.grid-cols-1.lg\\:grid-areas-series__body.lg\\:grid-cols-series.gap-x-4.px-4.py-2.sm\\:px-8 > div.lg\\:grid-in-content.mt-4 > div:nth-child(1) > div:nth-child(3) > div > div > a',
    ).each((_, el) => {
      // Skip entries that have a direct > span child (non-chapter items)
      if ($(el).find('> span').length) return;

      const chapterName = $(el).find('div > div > span').first().text().trim();
      const chapterUrl = $(el).attr('href');

      if (!chapterName || !chapterUrl) return;

      chapters.push({
        name: chapterName,
        path: chapterUrl.replace(this.site, ''),
        releaseTime: null,
      });
    });

    // The Kotlin code calls .reversed(), so we reverse the order
    chapters.reverse();

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const res = await fetchApi(url);
    const body = await res.text();
    const $ = loadCheerio(body);

    const chapterText =
      $(
        'main > div.justify-center.flex-grow.mx-auto.prose.md\\:max-w-4xl.lg\\:relative',
      ).html() || '';

    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    console.log(`Searching for "${searchTerm}" on ReadHive...`);
    const formData = new FormData();
    formData.append('query', searchTerm);
    formData.append('action', 'search');

    const res = await fetchApi(`${this.site}/ajax`, {
      method: 'POST',
      Referrer: `${this.site}/`,
      body: formData,
    });

    console.log('Search response status: ', res.status);

    const json = await res.json();

    console.log('Search response JSON: ', json);

    if (!json?.success || !Array.isArray(json?.data?.posts)) return [];

    const novels: Plugin.NovelItem[] = json.data.map((card: any) => {
      const href: string = card.url ?? '';
      const cover: string = card.thumb ?? '';
      console.log('Search result:', { title: card.title, href, cover });

      return {
        name: card.title ?? '',
        path: href.replace(this.site, ''),
        cover: cover || defaultCover,
      };
    });

    return novels;
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new ReadhivePlugin();
