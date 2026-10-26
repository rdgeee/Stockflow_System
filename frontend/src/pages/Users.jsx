import ResourcePage from "./ResourcePage.jsx";

export default function Users({ globalQuery, user }) {
  return <ResourcePage resource="Users" globalQuery={globalQuery} user={user} />;
}
