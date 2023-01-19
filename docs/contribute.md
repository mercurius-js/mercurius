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
        <div class="card-content">
          <div class="media">
            <div class="media-content">
              <p class="title is-4">
                <a :href="issue.url">{{ issue.title }}</a>
              </p>
              <p class="subtitle is-6">
                <a :href="issue.project.url">{{ issue.project.name }}</a>
              </p>
              <p>
                <strong>{{ issue.comments }}</strong>
                <span> Comments</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-if="Object.keys(projects).length > 0" class="project-filters">
    <!-- <label v-for="(project, name) in projects" class="panel-block checkbox">
      <input :type="checkbox" :checked="project.selected" @change="toggleProject(name, $event.target.checked)" />
      <span>{{ name }} <span class="has-text-grey-light">({{ project.count }})</span></span>
    </label> -->
    <button @click="_toggleProjects(true)">Select All</button>
    <button @click="_toggleProjects(false)">Clear All</button>
  </div>
</div>
