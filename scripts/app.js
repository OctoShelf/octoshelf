
let repoSection = document.getElementById('repoSection');
let authStatus = document.getElementById('authStatus');
let syncAll = document.getElementById('syncAll');
let addRepoForm = document.getElementById('addRepoForm');
let addRepoInput = document.getElementById('addRepoInput');

let authToken = document.getElementById('github_authToken').value;
let oathUrl = document.getElementById('github_oathUrl').value;
let clientId = document.getElementById('github_clientId').value;

let stylesheetHelper = document.createElement("style");
document.head.appendChild(stylesheetHelper);

// Event Listeners
let resizeDebounce;
addRepoForm.addEventListener('submit', function(event) {

  event.preventDefault();
  addRepo(addRepoInput.value);
  addRepoInput.value = '';
});
syncAll.addEventListener('click', function(event) {
  event.preventDefault();
  repositories.forEach(repository => getRepoDetails(repository));
});
window.addEventListener('resize', function(event) {
  if (resizeDebounce) {
    clearTimeout(resizeDebounce);
  }

  resizeDebounce = setTimeout(function(innerHeight, innerWidth) {
    centerBubbles(innerHeight, innerWidth);
  }, 60, window.innerHeight, window.innerWidth);
});
repoSection.addEventListener('click', function(event) {

  let { action, id } = event.target && event.target.dataset;

  // TODO: clean this up so its not a if ladder
  if (action === 'refresh') {
    event.preventDefault();
    let repository = repositoriesMap.get(id);
    return getRepoDetails(repository);
  }
});

function updateAccessToken(newAccessToken) {
  if (!newAccessToken) {
    return;
  }
  setAccessToken(newAccessToken);
  authStatus.classList.remove('octicon-issue-reopened');
  authStatus.classList.add('octicon-issue-closed');
}

function centerBubbles(innerHeight, innerWidth) {

  let bubbleModify = bubbleSize / 2;
  let top = (innerHeight / 2) - bubbleModify;
  let left = (innerWidth / 2) - bubbleModify;

  if (stylesheetHelper.sheet.rules.length) {
    stylesheetHelper.sheet.removeRule(0);
  }
  stylesheetHelper.sheet.insertRule(`.bubble { top: ${top}px; left: ${left}px; }`);
}

// TODO: Add everything below this to a WebWorker
const repositories = [];
const repositoriesSet = new Set();
const repositoriesMap = new Map();
const apiUrl = 'https://api.github.com';
const bubbleSize = 150;
const distanceFromCenter = 250;
let accessToken = '';


let repository = {
  url: '',
  placeholderUpdated: false,
  fetchedDetails: false
};

/**
 * Impl note: I'm putting this IIFE here temporarily so that I am not accessing
 * undeclared variables. It should NOT be pulled into the WebWorker
 */
(function init(innerHeight, innerWidth) {
  centerBubbles(innerHeight, innerWidth);
  updateAccessToken(authToken.value);

})(window.innerHeight, window.innerWidth);

function setAccessToken(newAccessToken) {
  accessToken = newAccessToken;
}

/**
 * Given a PR Object (from Github's API), return a slimmer version
 */
function simplifyPR({ id, title, body, html_url:url }) {
  return { id, title, body, url };
}

/**
 * Add a Repo to our repos array
 * @param url
 */
function addRepo(url) {
  if (repositoriesSet.has(url)) {
    return;
  }

  let newRepository = Object.assign({}, repository, {
    prs: [],
    url: url
  });

  repositories.push(newRepository);
  repositoriesSet.add(url);

  let placeholder = drawPlaceholderRepo(newRepository);
  return getRepoDetails(newRepository, placeholder);
}

function fetchGithubApi(url, accessToken) {
  return fetch(`${url}?accessToken=${accessToken}`);
}

/**
 * Fetch Details about a Repo (title, etc)
 * @param repoUrl
 * @returns {*}
 */
function fetchRepoDetails(repoUrl) {
  return fetchGithubApi(`${apiUrl}/repos/${repoUrl}`, accessToken);
}

/**
 * Fetch a Repo's Pull Requests
 * @param repoUrl
 * @returns {*}
 */
function fetchRepoPulls(repoUrl) {
  return fetchGithubApi(`${apiUrl}/repos/${repoUrl}/pulls`, accessToken);
}

/**
 * Fetch a Repo's details and open pull requests
 * @param repoUrl
 * @returns {Promise.<T>}
 */
function fetchRepo(repoUrl){
  return Promise.all([fetchRepoDetails(repoUrl), fetchRepoPulls(repoUrl)])
    .then(([repoDetails, repoPulls]) => {
      return Promise.all([repoDetails.json(), repoPulls.json()])
    });
}

function getRepoDetails(repository, placeholder) {

  let { url, fetchedDetails } = repository;

  // TODO: Update this to allow for corp github instances
  let repoUrl = url.replace('https://github.com/', '');

  // If we already got the repository details, lets only fetch pull requests
  if (fetchedDetails) {

    return fetchRepoPulls(repoUrl)
      .then(repoPulls => repoPulls.json())
      .then(repoPulls => {
        repository.prs = repoPulls.map(simplifyPR);
      })
      .then(() => {
        updateRepository(repository, placeholder);
      })
      .then(updateRotations);
  }

  fetchRepo(repoUrl)
    .then(([{ id, name, full_name}, repoPulls]) => {
      repository.id = id;
      repository.name = name;
      repository.fullName = full_name;
      repository.prs = repoPulls.map(simplifyPR);
      repository.fetchedDetails = true;

      repositoriesMap.set(''+id, repository);
    })
    .then(() => {
      updateRepository(repository, placeholder);
    })
    .then(updateRotations);
}

/**
 * Draw a simple placeholder repo into the repoSection.
 * Later we will fill up the drawn element with more data.
 * @param url {String}
 * @returns {Element}
 */
function drawPlaceholderRepo({ url }) {

  let lastRepo = repoSection.lastElementChild;

  let article = document.createElement('article');
  article.setAttribute('class', 'bubble repository');

  let articleInner = document.createElement('div');
  articleInner.setAttribute('class', 'articleInner');

  let header = document.createElement('header');
  let title = document.createElement('span');
  title.setAttribute('class', 'repo-title');

  let sync = document.createElement('a');
  sync.setAttribute('href', '#');
  sync.setAttribute('class', 'octicon octicon-sync');
  sync.setAttribute('data-action', 'refresh');
  sync.setAttribute('data-id', '');

  let prListItems = document.createElement('ul');
  prListItems.setAttribute('class', 'prList');

  if (lastRepo) {
    article.style.cssText = lastRepo.getAttribute('style');
    articleInner.style.cssText = lastRepo.firstElementChild.getAttribute('style');
  }

  repoSection
    .appendChild(article)
    .appendChild(articleInner)
    .appendChild(header)
    .appendChild(title)
    .appendChild(document.createTextNode(url));

  articleInner.appendChild(prListItems);
  articleInner.appendChild(sync);

  return article;
}

function updateRepository(repository, placeholder) {

  let { id, name, fullName, placeholderUpdated, prs } = repository;
  let article = document.getElementById(id) || placeholder;

  if (!article) {
    article = drawPlaceholderRepo(repository)
  }

  // If we have not had the opportunity to the DOM earlier, do it now.
  if (!placeholderUpdated) {
    // If there wasn't an id before, set it now
    if (!article.id) {
      article.setAttribute('id', id);
    }

    let sync = article.querySelector('.octicon-sync');
    sync.setAttribute('data-id', id);

    // Swap out the title with a better one
    let repoTitle = article.querySelector('.repo-title');
    repoTitle.innerText = name;
    repoTitle.setAttribute('title', fullName);

    repository.placeholderUpdated = true;
  }

  let prListItems = article.querySelector('.prList');
  let pullRequestFragment = document.createDocumentFragment();

  if (prs.length > 10) {
    prListItems.classList.add('lotsOfPRs');
  } else {
    prListItems.classList.remove('lotsOfPRs');
  }

  prs.forEach(({ id, title, url }) => {

    let prListItem = document.createElement('li');
    let prLink = document.createElement('a');
    let prMoreInfo = document.createElement('span');


    prListItem.setAttribute('id', id);

    prLink.setAttribute('href', url);
    prLink.setAttribute('target', '_blank');
    prLink.setAttribute('class', 'prLink octicon octicon-git-pull-request');

    prListItem.classList.add('prListItem');
    prMoreInfo.classList.add('prMoreInfo');

    pullRequestFragment
      .appendChild(prListItem)
      .appendChild(prLink)
      .appendChild(prMoreInfo)
      .appendChild(document.createTextNode(title));
  });

  prListItems.innerHTML = '';
  prListItems.appendChild(pullRequestFragment);
}

function updateRotations() {
  let count = repoSection.childElementCount;
  let rotation = 360/count;
  let current = 0;

  let child = repoSection.firstElementChild;
  while (child) {
    let rotateBy = current*rotation;
    child.style.cssText = `transform: rotate(${rotateBy}deg) translateY(-${distanceFromCenter}px);`;
    child.firstElementChild.style.cssText = `transform: rotate(-${rotateBy}deg);`;
    current++;
    child = child.nextElementSibling;
  }
}