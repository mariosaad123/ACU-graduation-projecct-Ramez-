import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Container } from '../../components/layout/Container';
import { useFormatDate } from '../../i18n/use-format-date';
import { useLocale } from '../../i18n/use-locale';
import { PageTitle } from '../../pages/PageTitle';
import { ar } from './content/ar';
import { en } from './content/en';
import { SITE_PAGES, type SitePageId } from './content/types';
import styles from './SitePage.module.css';

const CONTENT = { ar, en };

/**
 * One of the platform's public reading pages: about, privacy, terms, credits, contact. The words
 * live in `content/`, one file per language; this page only sets them out so they are easy to
 * read and to find one's way around.
 */
export function SitePage({ page }: { page: SitePageId }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const formatDate = useFormatDate();
  const content = CONTENT[locale];
  const article = content[page];
  const anchor = (index: number) => `${page}-${String(index + 1)}`;

  return (
    <>
      <PageTitle>{article.title}</PageTitle>
      <Container className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{article.title}</h1>
          <p className={styles.lead}>{article.lead}</p>
          {article.updated && (
            <p className={styles.updated}>
              {t('site.updated', { date: formatDate(article.updated) })}
            </p>
          )}
        </header>

        <div className={styles.layout}>
          {article.sections.length > 2 && (
            <nav className={styles.contents} aria-label={t('site.contents')}>
              <p className={styles.contentsTitle}>{t('site.contents')}</p>
              <ol>
                {article.sections.map((section, index) => (
                  <li key={section.heading}>
                    <a href={`#${anchor(index)}`}>{section.heading}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <article className={styles.article}>
            {article.sections.map((section, index) => (
              <section
                key={section.heading}
                className={styles.section}
                aria-labelledby={anchor(index)}
              >
                <h2 id={anchor(index)} className={styles.heading}>
                  {section.heading}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items && (
                  <ul className={styles.items}>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {section.link && (
                  <a
                    className={styles.external}
                    href={section.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {section.link.label}
                    <ArrowSquareOutIcon className="mirror-in-rtl" aria-hidden="true" />
                  </a>
                )}
              </section>
            ))}
          </article>
        </div>

        <nav className={styles.more} aria-label={t('site.more')}>
          <p className={styles.contentsTitle}>{t('site.more')}</p>
          <ul>
            {SITE_PAGES.filter((other) => other !== page).map((other) => (
              <li key={other}>
                <Link to={`/${other}`}>{content[other].title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </>
  );
}
