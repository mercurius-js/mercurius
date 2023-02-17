# Contribute to Mercurius

Mercurius is a growing and friendly community, and would be lucky to have your contributions! 🙇‍♂️

Contributions are always welcome, we only ask you follow the Contribution Guidelines and the Code Of Conduct.

If you don't know where to start you can have a look at the list of good first issues below.

## Good First Issues

<div id="issues">
  <div v-if="loading" class="spinner"></div>
  <div v-if="error" class="message is-danger">
    <div class="message-header">
      <p>Error</p>
    </div>
    <div class="message-body">{{ error }}</div>
  </div>
  <div v-if="issues.length > 0" class="issues">
    <div v-for="issue in filteredIssues" class="good-issue">
      <div class="card">
        <div class="card-header">
            <div class="subtitle">
                <a :href="issue.project.url">{{ issue.project.name }}</a>
            </div>
        </div>
        <div class="card-content">
            <h3 class="title">
              <a :href="issue.url">{{ issue.title }}</a>
            </h3>
            <div class="issue-labels">
                <div v-for="label in issue.labels" >
                     <span class="issue-label">{{ label }}</span>
                </div>
            </div>
            <div class="issue-comments">
              <strong>{{ issue.comments }}</strong>
              <span> Comments</span>
            </div>
        </div>
      </div>
    </div>
  </div>
</div>
