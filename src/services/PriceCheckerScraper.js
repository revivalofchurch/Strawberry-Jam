// src/services/PriceCheckerScraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');

// Constants
const BASE_URL = "https://aj-item-worth.fandom.com";
const SEARCH_PATH = "/wiki/Special:Search";
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
};
const REQUEST_TIMEOUT = 25000; // Milliseconds

async function fetchPageContent(targetUrl) {
    try {
        const response = await axios.get(targetUrl, {
            headers: HEADERS,
            timeout: REQUEST_TIMEOUT,
            maxRedirects: 5,
        });
        return response.data;
    } catch (error) {
        console.error(`[PriceCheckerScraper] Error fetching ${targetUrl}:`, error.message);
        throw new Error(`Network Error fetching page: ${error.message}`);
    }
}

function parseSearchResults(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const results = [];
    $('ul.unified-search__results li.unified-search__result').slice(0, 15).each((index, element) => {
        const linkTag = $(element).find('article h3.unified-search__result__header a.unified-search__result__title');
        const title = linkTag.text().trim();
        const relativeUrl = linkTag.attr('href');

        if (title && relativeUrl) {
            const absoluteUrl = url.resolve(BASE_URL, relativeUrl);
            results.push({ title: title, url: absoluteUrl });
        }
    });
    return results;
}

function extractWorthDetails(htmlContent, pageUrl) {
    const $ = cheerio.load(htmlContent);
    const sections = [];
    const contentArea = $('div.mw-parser-output');

    if (contentArea.length === 0) {
        sections.push({ type: "text", title: "Error", content: "Could not find main content area to parse." });
        return sections;
    }

    contentArea.find('h2').each((index, h2Element) => {
        const sectionTitle = $(h2Element).find('.mw-headline').text().trim();
        if (!sectionTitle) return;

        let worthTable = null;
        let currentNode = $(h2Element).next();
        while (currentNode.length > 0 && !currentNode.is('h2')) {
            if (currentNode.is('table.wikitable, table.article-table')) {
                worthTable = currentNode;
                break;
            }
            const foundTable = currentNode.find('table.wikitable, table.article-table').first();
            if (foundTable.length > 0) {
                worthTable = foundTable;
                break;
            }
            currentNode = currentNode.next();
        }

        if (worthTable && worthTable.length > 0) {
            const rows = worthTable.find('tr');
            let headers = [];
            let tableRowsData = [];
            let tableImageUrls = [];

            if (rows.length > 0) {
                const headerRow = rows.first();
                headers = headerRow.find('th, td').map((i, el) => $(el).text().trim()).get();
                const dataRowsTr = rows.slice(1);
                let imageRowIndex = -1;

                dataRowsTr.each((rowIndex, rowElement) => {
                    if ($(rowElement).find('img').length > 0) {
                        imageRowIndex = rowIndex;
                        const numColumns = headers.length > 0 ? headers.length : $(rowElement).find('td, th').length;
                        const imageCells = $(rowElement).find('td, th');
                        for (let i = 0; i < numColumns; i++) {
                            let cellImageUrl = null;
                            if (i < imageCells.length) {
                                const imgTag = $(imageCells[i]).find('img').first();
                                if (imgTag.length > 0) {
                                    cellImageUrl = imgTag.attr('data-src') || imgTag.attr('src');
                                    if (cellImageUrl && cellImageUrl.includes('/scale-to-width-down/')) {
                                        cellImageUrl = cellImageUrl.split('/scale-to-width-down/')[0];
                                    }
                                }
                            }
                            tableImageUrls.push(cellImageUrl);
                        }
                        return false;
                    }
                });

                dataRowsTr.each((rowIndex, rowElement) => {
                    if (rowIndex === imageRowIndex) return;
                    let rowCellsText = [];
                    $(rowElement).find('td, th').each((cellIndex, cellElement) => {
                        let cellText = $(cellElement).text().replace(/\s+/g, ' ').trim();
                        rowCellsText.push(cellText);
                    });
                    if (rowCellsText.some(text => text)) {
                        tableRowsData.push(rowCellsText);
                    }
                });
            }

            if (headers.length > 0 || tableRowsData.length > 0) {
                sections.push({
                    type: "table",
                    title: sectionTitle,
                    headers: headers,
                    rows: tableRowsData,
                    imageUrls: tableImageUrls
                });
            }
        }
    });

    if (sections.length === 0) {
        const worthTable = contentArea.find('table.wikitable, table.article-table').first();
        if (worthTable.length > 0) {
            const rows = worthTable.find('tr');
            let headers = [];
            let tableRowsData = [];
            let tableImageUrls = [];

            if (rows.length > 0) {
                const headerRow = rows.first();
                headers = headerRow.find('th, td').map((i, el) => $(el).text().trim()).get();
                const dataRowsTr = rows.slice(1);
                let imageRowIndex = -1;

                dataRowsTr.each((rowIndex, rowElement) => {
                    if ($(rowElement).find('img').length > 0) {
                        imageRowIndex = rowIndex;
                        const numColumns = headers.length > 0 ? headers.length : $(rowElement).find('td, th').length;
                        const imageCells = $(rowElement).find('td, th');
                        for (let i = 0; i < numColumns; i++) {
                            let cellImageUrl = null;
                            if (i < imageCells.length) {
                                const imgTag = $(imageCells[i]).find('img').first();
                                if (imgTag.length > 0) {
                                    cellImageUrl = imgTag.attr('data-src') || imgTag.attr('src');
                                    if (cellImageUrl && cellImageUrl.includes('/scale-to-width-down/')) {
                                        cellImageUrl = cellImageUrl.split('/scale-to-width-down/')[0];
                                    }
                                }
                            }
                            tableImageUrls.push(cellImageUrl);
                        }
                        return false;
                    }
                });

                dataRowsTr.each((rowIndex, rowElement) => {
                    if (rowIndex === imageRowIndex) return;
                    let rowCellsText = [];
                    $(rowElement).find('td, th').each((cellIndex, cellElement) => {
                        let cellText = $(cellElement).text().replace(/\s+/g, ' ').trim();
                        rowCellsText.push(cellText);
                    });
                    if (rowCellsText.some(text => text)) {
                        tableRowsData.push(rowCellsText);
                    }
                });
            }

            if (headers.length > 0 || tableRowsData.length > 0) {
                sections.push({
                    type: "table",
                    title: "Worth Details",
                    headers: headers,
                    rows: tableRowsData,
                    imageUrls: tableImageUrls
                });
            }
        }
    }

    if (sections.length === 0) {
        sections.push({ type: "text", title: "Not Found", content: "Could not extract specific worth details from the page structure." });
    }
    return sections;
}

async function searchForItems(searchTerm) {
    const searchUrl = `${BASE_URL}${SEARCH_PATH}?query=${encodeURIComponent(searchTerm)}&scope=internal&navigationSearch=true`;
    const htmlContent = await fetchPageContent(searchUrl);
    return parseSearchResults(htmlContent);
}

async function getItemDetails(pageUrl) {
    if (!pageUrl || !pageUrl.startsWith(BASE_URL)) {
        throw new Error(`Invalid page URL provided.`);
    }
    const htmlContent = await fetchPageContent(pageUrl);
    const sections = extractWorthDetails(htmlContent, pageUrl);
    return { sections: sections, source_url: pageUrl };
}

module.exports = {
  searchForItems,
  getItemDetails
};
