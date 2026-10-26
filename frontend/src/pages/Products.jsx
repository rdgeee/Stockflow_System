import ResourcePage from "./ResourcePage.jsx";

export default function Products({ globalQuery, user }) {
  return <ResourcePage resource="Products" globalQuery={globalQuery} user={user} />;
}
