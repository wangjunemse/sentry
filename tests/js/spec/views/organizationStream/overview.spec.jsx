import {browserHistory} from 'react-router';
import {clonedeep} from 'lodash';
import React from 'react';

import {initializeOrg} from 'app-test/helpers/initializeOrg';
import {mount, shallow} from 'enzyme';
import ErrorRobot from 'app/components/errorRobot';
import GroupStore from 'app/stores/groupStore';
import OrganizationStreamWithStores, {
  OrganizationStream,
} from 'app/views/organizationStream/overview';
import StreamGroup from 'app/components/stream/group';
import TagStore from 'app/stores/tagStore';

// Mock <StreamSidebar> and <StreamActions>
jest.mock('app/views/stream/sidebar', () => jest.fn(() => null));
jest.mock('app/views/stream/actions', () => jest.fn(() => null));
jest.mock('app/components/stream/group', () => jest.fn(() => null));

const DEFAULT_LINKS_HEADER =
  '<http://127.0.0.1:8000/api/0/organizations/org-slug/issues/?cursor=1443575731:0:1>; rel="previous"; results="false"; cursor="1443575731:0:1", ' +
  '<http://127.0.0.1:8000/api/0/organizations/org-slug/issues/?cursor=1443575731:0:0>; rel="next"; results="true"; cursor="1443575731:0:0';

describe('OrganizationStream', function() {
  let wrapper;
  let props;

  let organization;
  let project;
  let group;
  let savedSearch;

  let fetchTagsRequest;
  let fetchMembersRequest;

  beforeEach(function() {
    MockApiClient.clearMockResponses();
    project = TestStubs.ProjectDetails({
      id: '3559',
      name: 'Foo Project',
      slug: 'project-slug',
      firstEvent: true,
    });
    organization = TestStubs.Organization({
      id: '1337',
      slug: 'org-slug',
      access: ['releases'],
      features: [],
      projects: [project],
    });

    savedSearch = TestStubs.Search({
      id: '789',
      query: 'is:unresolved',
      name: 'Unresolved Issues',
      projectId: project.id,
    });

    group = TestStubs.Group({project});
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/issues/',
      body: [group],
      headers: {
        Link: DEFAULT_LINKS_HEADER,
      },
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/searches/',
      body: [savedSearch],
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/processingissues/',
      method: 'GET',
      body: [
        {
          project: 'test-project',
          numIssues: 1,
          hasIssues: true,
          lastSeen: '2019-01-16T15:39:11.081Z',
        },
      ],
    });
    fetchTagsRequest = MockApiClient.addMockResponse({
      url: '/organizations/org-slug/tags/',
      method: 'GET',
      body: TestStubs.Tags(),
    });
    fetchMembersRequest = MockApiClient.addMockResponse({
      url: '/organizations/org-slug/users/',
      method: 'GET',
      body: [TestStubs.Member({projects: [project.slug]})],
    });

    TagStore.init();

    props = {
      savedSearchLoading: false,
      savedSearches: [savedSearch],
      useOrgSavedSearches: true,
      selection: {
        projects: [parseInt(organization.projects[0].id, 10)],
        environments: [],
        datetime: {period: '14d'},
      },
      location: {query: {query: 'is:unresolved'}, search: 'query=is:unresolved'},
      params: {orgId: organization.slug},
      organization,
    };
  });

  afterEach(function() {
    MockApiClient.clearMockResponses();
    if (wrapper) {
      wrapper.unmount();
    }
    wrapper = null;
  });

  describe('withStores and feature flags', function() {
    const {router, routerContext} = initializeOrg({
      organization: {
        features: ['org-saved-searches', 'recent-searches', 'global-views'],
        slug: 'org-slug',
      },
      router: {
        location: {query: {}, search: ''},
        params: {orgId: 'org-slug'},
      },
    });
    const defaultProps = {};
    let savedSearchesRequest;
    let recentSearchesRequest;
    let issuesRequest;

    /* helpers */
    const getSavedSearchTitle = w =>
      w.find('OrganizationSavedSearchSelector DropdownMenu ButtonTitle').text();

    const getSearchBarValue = w =>
      w
        .find('SmartSearchBarContainer StyledInput')
        .prop('value')
        .trim();

    const createWrapper = ({params, location, ...p} = {}) => {
      const newRouter = {
        ...router,
        params: {
          ...router.params,
          ...params,
        },
        location: {
          ...router.location,
          ...location,
        },
      };

      wrapper = mount(
        <OrganizationStreamWithStores {...newRouter} {...defaultProps} {...p} />,
        routerContext
      );
    };

    beforeEach(function() {
      StreamGroup.mockClear();

      recentSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/recent-searches/',
        method: 'GET',
        body: [],
      });
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [savedSearch],
      });
      issuesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/issues/',
        body: [group],
        headers: {
          Link: DEFAULT_LINKS_HEADER,
        },
      });
    });

    it('loads group rows with default query (no pinned queries, and no query in URL)', async function() {
      createWrapper();

      // Loading saved searches
      expect(savedSearchesRequest).toHaveBeenCalledTimes(1);
      // Update stores with saved searches
      await tick();
      wrapper.update();

      // auxillary requests being made
      expect(recentSearchesRequest).toHaveBeenCalledTimes(1);
      expect(fetchTagsRequest).toHaveBeenCalledTimes(1);
      expect(fetchMembersRequest).toHaveBeenCalledTimes(1);

      // primary /issues/ request
      expect(issuesRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // Should be called with default query
          data: expect.stringContaining('is%3Aunresolved'),
        })
      );

      expect(getSearchBarValue(wrapper)).toBe('is:unresolved');

      // Organization saved search selector should have default saved search selected
      expect(getSavedSearchTitle(wrapper)).toBe('Unresolved Issues');

      // This is mocked
      expect(StreamGroup).toHaveBeenCalled();
    });

    it('loads with query in URL and pinned queries', async function() {
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [
          savedSearch,
          TestStubs.Search({
            id: '123',
            name: 'My Pinned Search',
            isPinned: true,
            query: 'is:resolved',
          }),
        ],
      });

      createWrapper({
        location: {
          query: {
            query: 'level:foo',
          },
        },
      });

      // Update stores with saved searches
      await tick();
      wrapper.update();

      // Main /issues/ request
      expect(issuesRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // Should be called with default query
          data: expect.stringContaining('level%3Afoo'),
        })
      );

      expect(getSearchBarValue(wrapper)).toBe('level:foo');

      // Custom search
      expect(getSavedSearchTitle(wrapper)).toBe('Custom Search');
    });

    it('loads with a pinned saved query', async function() {
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [
          savedSearch,
          TestStubs.Search({
            id: '123',
            name: 'Org Custom',
            isPinned: true,
            isGlobal: false,
            isOrgCustom: true,
            query: 'is:resolved',
          }),
        ],
      });
      createWrapper();

      await tick();
      wrapper.update();

      expect(issuesRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // Should be called with default query
          data: expect.stringContaining('is%3Aresolved'),
        })
      );

      expect(getSearchBarValue(wrapper)).toBe('is:resolved');

      // Organization saved search selector should have default saved search selected
      expect(getSavedSearchTitle(wrapper)).toBe('Org Custom');
    });

    it('loads with a pinned custom query', async function() {
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [
          savedSearch,
          TestStubs.Search({
            id: '123',
            name: 'My Pinned Search',
            isPinned: true,
            isGlobal: false,
            isOrgCustom: false,
            query: 'is:resolved',
          }),
        ],
      });
      createWrapper();

      await tick();
      wrapper.update();

      expect(issuesRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // Should be called with default query
          data: expect.stringContaining('is%3Aresolved'),
        })
      );

      expect(getSearchBarValue(wrapper)).toBe('is:resolved');

      // Organization saved search selector should have default saved search selected
      expect(getSavedSearchTitle(wrapper)).toBe('My Pinned Search');
    });

    it('loads with a saved query', async function() {
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [
          TestStubs.Search({
            id: '123',
            name: 'Assigned to Me',
            isPinned: false,
            isGlobal: true,
            query: 'assigned:me',
            projectId: null,
            type: 0,
          }),
        ],
      });
      createWrapper({params: {searchId: '123'}});

      await tick();
      wrapper.update();

      expect(issuesRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // Should be called with default query
          data: expect.stringContaining('assigned%3Ame'),
        })
      );

      expect(getSearchBarValue(wrapper)).toBe('assigned:me');

      // Organization saved search selector should have default saved search selected
      expect(getSavedSearchTitle(wrapper)).toBe('Assigned to Me');
    });

    it('loads with a query in URL', async function() {
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [
          TestStubs.Search({
            id: '123',
            name: 'Assigned to Me',
            isPinned: false,
            isGlobal: true,
            query: 'assigned:me',
            projectId: null,
            type: 0,
          }),
        ],
      });
      createWrapper({location: {query: {query: 'level:error'}}});

      await tick();
      wrapper.update();

      expect(issuesRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // Should be called with default query
          data: expect.stringContaining('level%3Aerror'),
        })
      );

      expect(getSearchBarValue(wrapper)).toBe('level:error');

      // Organization saved search selector should have default saved search selected
      expect(getSavedSearchTitle(wrapper)).toBe('Custom Search');
    });

    it('selects a saved search and changes sort', async function() {
      const localSavedSearch = {...savedSearch, projectId: null};
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [localSavedSearch],
      });
      createWrapper();
      await tick();
      wrapper.update();

      wrapper.find('OrganizationSavedSearchSelector DropdownButton').simulate('click');
      wrapper
        .find('OrganizationSavedSearchSelector MenuItem a')
        .first()
        .simulate('click');

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pathname: '/organizations/org-slug/issues/searches/789/',
        })
      );

      // Need to update component
      wrapper.setProps({
        savedSearch: localSavedSearch,
        location: {
          ...router.location,
          pathname: '/organizations/org-slug/issues/searches/789/',
          query: {
            environment: [],
            project: [],
          },
        },
      });

      wrapper.find('SortOptions DropdownButton').simulate('click');
      wrapper
        .find('SortOptions MenuItem a')
        .at(3)
        .simulate('click');

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pathname: '/organizations/org-slug/issues/searches/789/',
          query: {
            environment: [],
            sort: 'freq',
          },
        })
      );
    });

    it('pins and unpins a custom query', async function() {
      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [savedSearch],
      });
      createWrapper();
      await tick();
      wrapper.update();

      const createPin = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/pinned-searches/',
        method: 'PUT',
        body: {
          ...savedSearch,
          id: '666',
          query: 'assigned:me level:fatal',
          isPinned: true,
        },
      });

      wrapper
        .find('SmartSearchBar input')
        .simulate('change', {target: {value: 'assigned:me level:fatal'}});
      wrapper.find('SmartSearchBar form').simulate('submit');

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            query: 'assigned:me level:fatal',
          }),
        })
      );

      wrapper.setProps({
        location: {
          ...router.location,
          query: {
            query: 'assigned:me level:fatal',
          },
        },
      });

      expect(wrapper.find('OrganizationSavedSearchSelector ButtonTitle').text()).toBe(
        'Custom Search'
      );

      wrapper.find('Button[aria-label="Pin this search"]').simulate('click');

      expect(createPin).toHaveBeenCalled();

      await tick();
      wrapper.update();

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        '/organizations/org-slug/issues/searches/666/'
      );

      wrapper.setProps({
        params: {
          ...router.params,
          searchId: '666',
        },
      });

      await tick();
      wrapper.update();

      expect(wrapper.find('OrganizationSavedSearchSelector ButtonTitle').text()).toBe(
        'My Pinned Search'
      );
    });

    it('pins and unpins a saved query', async function() {
      const assignedToMe = TestStubs.Search({
        id: '234',
        name: 'Assigned to Me',
        isPinned: false,
        isGlobal: true,
        query: 'assigned:me',
        projectId: null,
        type: 0,
      });

      savedSearchesRequest = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/searches/',
        body: [savedSearch, assignedToMe],
      });
      createWrapper();
      await tick();
      wrapper.update();

      let createPin = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/pinned-searches/',
        method: 'PUT',
        body: {
          ...savedSearch,
          isPinned: true,
        },
      });

      wrapper.find('OrganizationSavedSearchSelector DropdownButton').simulate('click');
      wrapper
        .find('OrganizationSavedSearchSelector MenuItem a')
        .first()
        .simulate('click');

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pathname: '/organizations/org-slug/issues/searches/789/',
          query: {
            environment: [],
            project: ['3559'],
          },
        })
      );

      wrapper.setProps({
        params: {
          ...router.params,
          searchId: '789',
        },
      });

      expect(wrapper.find('OrganizationSavedSearchSelector ButtonTitle').text()).toBe(
        'Unresolved Issues'
      );

      wrapper.find('Button[aria-label="Pin this search"]').simulate('click');

      expect(createPin).toHaveBeenCalled();

      await tick();
      wrapper.update();

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        '/organizations/org-slug/issues/searches/789/'
      );

      wrapper.setProps({
        params: {
          ...router.params,
          searchId: '789',
        },
      });

      await tick();
      wrapper.update();

      expect(wrapper.find('OrganizationSavedSearchSelector ButtonTitle').text()).toBe(
        'Unresolved Issues'
      );

      // Select other saved search
      wrapper.find('OrganizationSavedSearchSelector DropdownButton').simulate('click');
      wrapper
        .find('OrganizationSavedSearchSelector MenuItem a')
        .at(1)
        .simulate('click');

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pathname: '/organizations/org-slug/issues/searches/234/',
          query: {
            environment: [],
          },
        })
      );

      wrapper.setProps({
        params: {
          ...router.params,
          searchId: '234',
        },
      });

      expect(wrapper.find('OrganizationSavedSearchSelector ButtonTitle').text()).toBe(
        'Assigned to Me'
      );

      createPin = MockApiClient.addMockResponse({
        url: '/organizations/org-slug/pinned-searches/',
        method: 'PUT',
        body: {
          ...assignedToMe,
          isPinned: true,
        },
      });

      wrapper.find('Button[aria-label="Pin this search"]').simulate('click');

      expect(createPin).toHaveBeenCalled();

      await tick();
      wrapper.update();

      expect(browserHistory.push).toHaveBeenLastCalledWith(
        '/organizations/org-slug/issues/searches/234/'
      );

      wrapper.setProps({
        params: {
          ...router.params,
          searchId: '234',
        },
      });

      await tick();
      wrapper.update();

      expect(wrapper.find('OrganizationSavedSearchSelector ButtonTitle').text()).toBe(
        'Assigned to Me'
      );
    });

    it.todo('saves a new query');

    it.todo('loads pinned search when invalid saved search id is accessed');
  });

  describe('transitionTo', function() {
    let instance;
    beforeEach(function() {
      wrapper = shallow(<OrganizationStream {...props} />, {
        disableLifecycleMethods: false,
      });
      instance = wrapper.instance();
    });

    it('transitions to query updates', function() {
      instance.transitionTo({query: 'is:ignored'});

      expect(browserHistory.push).toHaveBeenCalledWith({
        pathname: '/organizations/org-slug/issues/',
        query: {
          environment: [],
          project: [parseInt(project.id, 10)],
          query: 'is:ignored',
          statsPeriod: '14d',
        },
      });
    });

    it('transitions to saved search that has a projectId', function() {
      savedSearch = {
        id: 123,
        projectId: 99,
        query: 'foo:bar',
      };
      instance.transitionTo(null, savedSearch);

      expect(browserHistory.push).toHaveBeenCalledWith({
        pathname: '/organizations/org-slug/issues/searches/123/',
        query: {
          environment: [],
          project: [savedSearch.projectId],
          statsPeriod: '14d',
        },
      });
    });

    it('goes to all projects when using a basic saved searches and global-views feature', function() {
      organization.features = ['global-views'];
      savedSearch = {
        id: 1,
        project: null,
        query: 'is:unresolved',
      };
      instance.transitionTo(null, savedSearch);

      expect(browserHistory.push).toHaveBeenCalledWith({
        pathname: '/organizations/org-slug/issues/searches/1/',
        query: {
          environment: [],
          statsPeriod: '14d',
        },
      });
    });

    it('retains project selection when using a basic saved search and no global-views feature', function() {
      organization.features = [];
      savedSearch = {
        id: 1,
        projectId: null,
        query: 'is:unresolved',
      };
      instance.transitionTo(null, savedSearch);

      expect(browserHistory.push).toHaveBeenCalledWith({
        pathname: '/organizations/org-slug/issues/searches/1/',
        query: {
          environment: [],
          project: props.selection.projects,
          statsPeriod: '14d',
        },
      });
    });
  });

  describe('getEndpointParams', function() {
    beforeEach(function() {
      wrapper = shallow(<OrganizationStream {...props} />, {
        disableLifecycleMethods: false,
      });
    });

    it('omits null values', function() {
      wrapper.setProps({
        selection: {
          projects: null,
          environments: null,
          datetime: {period: '14d'},
        },
      });
      const value = wrapper.instance().getEndpointParams();

      expect(value.project).toBeUndefined();
      expect(value.projects).toBeUndefined();
      expect(value.environment).toBeUndefined();
      expect(value.environments).toBeUndefined();
      expect(value.statsPeriod).toEqual('14d');
    });

    it('omits defaults', function() {
      wrapper.setProps({
        location: {
          query: {
            sort: 'date',
            groupStatsPeriod: '24h',
          },
        },
      });
      const value = wrapper.instance().getEndpointParams();

      expect(value.groupStatsPeriod).toBeUndefined();
      expect(value.sort).toBeUndefined();
    });

    it('uses saved search data', function() {
      const value = wrapper.instance().getEndpointParams();

      expect(value.query).toEqual(savedSearch.query);
      expect(value.project).toEqual([parseInt(savedSearch.projectId, 10)]);
    });
  });

  describe('componentDidMount', function() {
    beforeEach(function() {
      wrapper = shallow(<OrganizationStream {...props} />);
    });

    it('fetches tags and sets state', async function() {
      const instance = wrapper.instance();
      await instance.componentDidMount();

      expect(fetchTagsRequest).toHaveBeenCalled();
      expect(instance.state.tags.assigned).toBeTruthy();
      expect(instance.state.tagsLoading).toBeFalsy();
    });

    it('fetches members and sets state', async function() {
      const instance = wrapper.instance();
      await instance.componentDidMount();
      await wrapper.update();

      expect(fetchMembersRequest).toHaveBeenCalled();

      const members = instance.state.memberList;
      // Spot check the resulting structure as we munge it a bit.
      expect(members).toBeTruthy();
      expect(members[project.slug]).toBeTruthy();
      expect(members[project.slug][0].email).toBeTruthy();
    });

    it('fetches groups when there is no searchid', async function() {
      await wrapper.instance().componentDidMount();
    });
  });

  describe('componentDidUpdate fetching groups', function() {
    let fetchDataMock;
    beforeEach(function() {
      fetchDataMock = jest.fn();
      wrapper = shallow(<OrganizationStream {...props} />, {
        disableLifecycleMethods: false,
      });
      wrapper.instance().fetchData = fetchDataMock;
    });

    it('fetches data on selection change', function() {
      const selection = {projects: [99], environments: [], datetime: {period: '24h'}};
      wrapper.setProps({selection, foo: 'bar'});

      expect(fetchDataMock).toHaveBeenCalled();
    });

    it('fetches data on savedSearch change', function() {
      savedSearch = {id: '1', query: 'is:resolved'};
      wrapper.setProps({savedSearch});
      wrapper.update();

      expect(fetchDataMock).toHaveBeenCalled();
    });

    it('fetches data on location change', function() {
      const queryAttrs = ['query', 'sort', 'statsPeriod', 'cursor', 'groupStatsPeriod'];
      let location = clonedeep(props.location);
      queryAttrs.forEach((attr, i) => {
        // reclone each iteration so that only one property changes.
        location = clonedeep(location);
        location.query[attr] = 'newValue';
        wrapper.setProps({location});
        wrapper.update();

        // Each propery change should cause a new fetch incrementing the call count.
        expect(fetchDataMock).toHaveBeenCalledTimes(i + 1);
      });
    });
  });

  describe('componentDidUpdate fetching members', function() {
    beforeEach(function() {
      wrapper = shallow(<OrganizationStream {...props} />, {
        disableLifecycleMethods: false,
      });
      wrapper.instance().fetchData = jest.fn();
    });

    it('fetches memberlist on project change', function() {
      // Called during componentDidMount
      expect(fetchMembersRequest).toHaveBeenCalledTimes(1);

      const selection = {
        projects: [99],
        environments: [],
        datetime: {period: '24h'},
      };
      wrapper.setProps({selection});
      wrapper.update();
      expect(fetchMembersRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('componentDidUpdate fetching tags', function() {
    beforeEach(function() {
      wrapper = shallow(<OrganizationStream {...props} />, {
        disableLifecycleMethods: false,
      });
      wrapper.instance().fetchData = jest.fn();
    });

    it('fetches tags on project change', function() {
      // Called during componentDidMount
      expect(fetchTagsRequest).toHaveBeenCalledTimes(1);

      const selection = {
        projects: [99],
        environments: [],
        datetime: {period: '24h'},
      };
      wrapper.setProps({selection});
      wrapper.update();

      expect(fetchTagsRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('processingIssues', function() {
    beforeEach(function() {
      wrapper = shallow(<OrganizationStream {...props} />);
    });

    it('fetches and displays processing issues', async function() {
      const instance = wrapper.instance();
      instance.componentDidMount();
      await wrapper.update();

      GroupStore.add([group]);
      wrapper.setState({
        groupIds: ['1'],
        loading: false,
      });

      const issues = wrapper.find('ProcessingIssueList');
      expect(issues).toHaveLength(1);
    });
  });

  describe('render states', function() {
    beforeEach(function() {
      wrapper = shallow(<OrganizationStream {...props} />, {
        disableLifecycleMethods: false,
      });
    });

    it('displays the loading icon', function() {
      wrapper.setState({savedSearchLoading: true});
      expect(wrapper.find('LoadingIndicator')).toHaveLength(1);
    });

    it('displays an error', function() {
      wrapper.setState({
        error: 'Things broke',
        savedSearchLoading: false,
        issuesLoading: false,
      });

      const error = wrapper.find('LoadingError');
      expect(error).toHaveLength(1);
      expect(error.props().message).toEqual('Things broke');
    });

    it('displays an empty resultset', function() {
      wrapper.setState({
        savedSearchLoading: false,
        issuesLoading: false,
        error: false,
        groupIds: [],
      });
      expect(wrapper.find('EmptyStateWarning')).toHaveLength(1);
    });
  });

  describe('Empty State', function() {
    const createWrapper = moreProps => {
      const defaultProps = {
        savedSearchLoading: false,
        useOrgSavedSearches: true,
        selection: {
          projects: [],
          environments: [],
          datetime: {period: '14d'},
        },
        location: {query: {query: 'is:unresolved'}, search: 'query=is:unresolved'},
        params: {orgId: organization.slug},
        organization: TestStubs.Organization({
          projects: [],
        }),
        ...moreProps,
      };
      const localWrapper = shallow(<OrganizationStream {...defaultProps} />, {
        disableLifecycleMethods: false,
      });
      localWrapper.setState({
        error: false,
        issuesLoading: false,
        groupIds: [],
      });

      return localWrapper;
    };

    it('displays when no projects selected and all projects user is member of, does not have first event', function() {
      wrapper = createWrapper({
        organization: TestStubs.Organization({
          projects: [
            TestStubs.Project({
              id: '1',
              slug: 'foo',
              isMember: true,
              firstEvent: false,
            }),
            TestStubs.Project({
              id: '2',
              slug: 'bar',
              isMember: true,
              firstEvent: false,
            }),
            TestStubs.Project({
              id: '3',
              slug: 'baz',
              isMember: true,
              firstEvent: false,
            }),
          ],
        }),
      });

      expect(wrapper.find(ErrorRobot)).toHaveLength(1);
    });

    it('does not display when no projects selected and any projects have a first event', function() {
      wrapper = createWrapper({
        organization: TestStubs.Organization({
          projects: [
            TestStubs.Project({
              id: '1',
              slug: 'foo',
              isMember: true,
              firstEvent: false,
            }),
            TestStubs.Project({
              id: '2',
              slug: 'bar',
              isMember: true,
              firstEvent: true,
            }),
            TestStubs.Project({
              id: '3',
              slug: 'baz',
              isMember: true,
              firstEvent: false,
            }),
          ],
        }),
      });

      expect(wrapper.find(ErrorRobot)).toHaveLength(0);
    });

    it('displays when all selected projects do not have first event', function() {
      wrapper = createWrapper({
        selection: {
          projects: [1, 2],
          environments: [],
          datetime: {period: '14d'},
        },
        organization: TestStubs.Organization({
          projects: [
            TestStubs.Project({
              id: '1',
              slug: 'foo',
              isMember: true,
              firstEvent: false,
            }),
            TestStubs.Project({
              id: '2',
              slug: 'bar',
              isMember: true,
              firstEvent: false,
            }),
            TestStubs.Project({
              id: '3',
              slug: 'baz',
              isMember: true,
              firstEvent: false,
            }),
          ],
        }),
      });

      expect(wrapper.find(ErrorRobot)).toHaveLength(1);
    });

    it('does not display when any selected projects have first event', function() {
      wrapper = createWrapper({
        selection: {
          projects: [1, 2],
          environments: [],
          datetime: {period: '14d'},
        },
        organization: TestStubs.Organization({
          projects: [
            TestStubs.Project({
              id: '1',
              slug: 'foo',
              isMember: true,
              firstEvent: false,
            }),
            TestStubs.Project({
              id: '2',
              slug: 'bar',
              isMember: true,
              firstEvent: true,
            }),
            TestStubs.Project({
              id: '3',
              slug: 'baz',
              isMember: true,
              firstEvent: true,
            }),
          ],
        }),
      });

      expect(wrapper.find(ErrorRobot)).toHaveLength(0);
    });
  });
});
