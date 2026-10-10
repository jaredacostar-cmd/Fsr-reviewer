var languageKey = 'en-CA';
if (navigator && navigator.language)
    languageKey = navigator.language;

function updateAgreement(term) {

    if (term) {

        // If the agreement is accepted set the cookie and navigate to the coordinate selection page;
        setCookie('mto_site_term_agreement', term);
        window.location = $('div#site_links').find('a#mtoSiteMapAquisition').attr('href');
    }

    else {

        // If the agreement is not accepted set the cookie to null and navigate to the exit page;
        setCookie('mto_site_term_agreement', null);
        window.location = $('div#site_links').find('a#mtoSiteExit').attr('href');
    }

}

function updateSiteLinks(sourceURL) {

    // Split variables attached to the window link;
    if (sourceURL.indexOf('?') > -1) {
        var sourceVars = unescape(sourceURL).substring(sourceURL.indexOf('?'));

        // Attach the end of the window link to preserve variables to the site links;
        // Site links are stored in a 'div' in 'footer.inc';
        $('div#site_links').find('a#mtoSiteTerms').attr('href', $('div#site_links').find('a#mtoSiteTerms').attr('href') + sourceVars);
        $('div#site_links').find('a#mtoSiteMapAquisition').attr('href', $('div#site_links').find('a#mtoSiteMapAquisition').attr('href') + sourceVars);
        $('div#site_links').find('a#mtoSiteStatus').attr('href', $('div#site_links').find('a#mtoSiteStatus').attr('href') + sourceVars);
        $('div#site_links').find('a#mtoSiteResultsOut').attr('href', $('div#site_links').find('a#mtoSiteResultsOut').attr('href') + sourceVars);
        $('div#site_links').find('a#mtoSiteExit').attr('href', $('div#site_links').find('a#mtoSiteExit').attr('href') + sourceVars);
    }
}

function setCookie(name, value) {

    // Cookie expires after 30 days;
    exdate = new Date();
    exdate.setDate(exdate.getDate() + 30);

    // Save the cookie;
    if (value !== null && value !== undefined)
        document.cookie = name + '=' + escape(value) + '; expires=' + exdate.toUTCString() + '; path=/'
    else
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
}

function getCookie(name) {

    // Get list of cookies associated with the document;
    cookies = document.cookie.split(";");

    // Find and retrieve the cookie and its value;
    for (xx = 0; xx < cookies.length; xx++) {
        cookie = cookies[xx].replace(/^\s+|\s+$/g, '');
        if (cookie.match(name + '=') != null)
            return unescape(cookie.replace(name + '=', ''));
    }

    // Return null if the cookie is not found;
    return null;
}

function toggleModifiedLanguageHeader(modifiedLanguageHeader) {

    // Try to retrieve the instruction cookie if visibility has not been set;
    if (!modifiedLanguageHeader)
        modifiedLanguageHeader = getCookie('modifiedLanguageHeader');

    // Assign the default language if the cookie does not exist;
    if (!modifiedLanguageHeader)
        modifiedLanguageHeader = languageKey;

    // Refresh the page if the language has changed;
    switch (modifiedLanguageHeader) {

        case 'fr-CA':

            // French (Canada);
            $('.en-CA').hide();
            $('.fr-CA').show();
            break;

        default:

            // Default: English (Canada);
            $('.fr-CA').hide();
            $('.en-CA').show();
            break;
    }

    // Save the language key to be used with populating dialogs;
    languageKey = modifiedLanguageHeader;
}
